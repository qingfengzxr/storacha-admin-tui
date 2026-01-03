import { create as createStorachaClient } from '@storacha/client';
import { StoreConf } from '@storacha/client/stores/conf';
import { Signer } from '@storacha/client/principal/ed25519';
import * as Account from '@storacha/client/account';
import * as Proof from '@storacha/client/proof';

import { agentInfo } from '../state/agent.mjs';
import { CID } from '../config/multiformats.mjs';
import {
  formatBytes,
  formatTime,
  padEnd,
  padStart,
  parseNumberInput,
  pickTimestamp,
  sumShardSizes
} from '../utils/format.mjs';
import { digestToString, normalizeDigest, fetchBlobInfo } from '../utils/digest.mjs';
import {
  tuiChoice,
  tuiConfirm,
  tuiDangerConfirm,
  tuiLogger,
  tuiMessage,
  tuiPrompt,
  paginateList
} from '../tui/index.mjs';

const listRateLimits = async (client) => {
  const subject = await tuiPrompt('Rate Limits', 'Subject (e.g. did:mailto:alice@example.com):');
  if (!subject) {
    await tuiMessage('Rate Limits', 'Subject is required.');
    return;
  }

  const providerFallback =
    process.env.STORACHA_PROVIDER_DID ||
    process.env.STORACHA_PROVIDER ||
    process.env.W3UP_PROVIDER_DID ||
    '';
  const provider = await tuiPrompt('Rate Limits', 'Provider DID (resource):', providerFallback);

  const capability =
    client?.capability?.['rate-limit'] ||
    client?.capability?.rateLimit;

  if (!capability?.list) {
    const keys = Object.keys(client?.capability || {}).join(', ');
    const message = [
      'Rate-limit capability not available on this client.',
      keys ? `Available capability keys: ${keys}` : ''
    ]
      .filter(Boolean)
      .join('\n');
    await tuiMessage('Rate Limits', message);
    return;
  }

  const attempts = [];
  if (provider) {
    attempts.push({ subject, with: provider }, { subject, provider });
  }
  attempts.push({ subject });

  let out;
  let lastErr;
  for (const params of attempts) {
    try {
      out = await capability.list(params);
      if (out?.error) {
        lastErr = out.error;
        continue;
      }
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!out || out?.error || lastErr) {
    await tuiMessage('Rate Limits', `Query failed: ${lastErr?.message || lastErr || out?.error}`);
    return;
  }

  const limits = out?.ok?.limits || out?.limits || [];
  if (!limits.length) {
    await tuiMessage('Rate Limits', `Rate limits for ${subject}:\n(none)`);
    return;
  }
  const rows = limits.map((limit) => {
    const id = limit?.id ?? '(unknown)';
    const rate = limit?.limit ?? limit?.rate ?? '(unknown)';
    return `- id=${id} rate=${rate}`;
  });
  await tuiMessage('Rate Limits', `Rate limits for ${subject}:\n${rows.join('\n')}`);
};

const ensureAccountAccess = async (client) => {
  const accounts = Account.list({ agent: client.agent });
  const accountIds = Object.keys(accounts);
  if (accountIds.length) {
    return accountIds;
  }

  const envEmail = process.env.STORACHA_LOGIN_EMAIL;
  const email =
    envEmail || (await tuiPrompt('Login', 'Login email (e.g. you@example.com):'));
  if (!email) {
    throw new Error('No email provided. Set STORACHA_LOGIN_EMAIL or input an email to login.');
  }

  const log = tuiLogger('Login');
  log.append(`Starting email login for ${email}.`);
  log.append('We will send a confirmation email to your inbox.');
  log.append('Please open the email and click the approval link to continue.');
  try {
    const result = await Account.login({ agent: client.agent }, email);
    if (result?.error) {
      throw new Error(`Email login failed: ${result.error?.message || String(result.error)}`);
    }
    const account = result.ok;
    await account.save();
    const updated = Account.list({ agent: client.agent });
    const updatedIds = Object.keys(updated);
    log.append(`Login complete. Accounts: ${updatedIds.join(', ') || '--'}`);
    await new Promise((res) => setTimeout(res, 1000));
    log.close();
    return updatedIds;
  } catch (err) {
    log.append(`Login failed: ${err?.message || err}`);
    await new Promise((res) => setTimeout(res, 1500));
    log.close();
    throw err;
  }
};

const createClient = async () => {
  const key = process.env.STORACHA_SERVICE_KEY;
  const principal = key ? Signer.parse(key) : undefined;
  const profile = process.env.STORACHA_PROFILE || 'storacha-admin-tui';
  const store = new StoreConf({ profile });
  const options = principal ? { principal, store } : { store };
  const client = await createStorachaClient(options);
  agentInfo.did = client.agent.did();

  const proof = process.env.STORACHA_SERVICE_PROOF;
  if (proof) {
    try {
      const parsed = await Proof.parse(proof);
      await client.addSpace(parsed);
      console.log('[storacha-admin-tui] loaded STORACHA_SERVICE_PROOF');
    } catch (err) {
      console.warn(
        '[storacha-admin-tui] failed to parse STORACHA_SERVICE_PROOF, ignoring:',
        err?.message || err
      );
    }
  }

  const accountIds = await ensureAccountAccess(client);
  if (Array.isArray(accountIds)) {
    agentInfo.accounts = accountIds;
  }
  return client;
};

const listSpaces = (client) => client.spaces?.() ?? [];

const pickSpace = async (client) => {
  const spaces = listSpaces(client);
  if (!spaces.length) {
    await tuiMessage('Spaces', 'No spaces known to this agent.');
    return null;
  }
  const options = spaces.map((s) => `${s.name || '(no name)'}  ${s.did()}`);
  const idx = await tuiChoice('Choose a space', 'Enter: select  |  q/esc: cancel', options);
  if (idx == null) return null;
  return spaces[idx];
};

const ensureCurrentSpace = async (client, space) => {
  await client.setCurrentSpace(space.did());
};

const showSpaceUsage = async (client) => {
  const space = await pickSpace(client);
  if (!space) return;
  await ensureCurrentSpace(client, space);
  const result = await space.usage.get();
  if (result?.error) {
    await tuiMessage('Space Usage', `Usage error: ${result.error?.message || result.error}`);
    return;
  }
  await tuiMessage(
    'Space Usage',
    `Usage for ${space.name} (${space.did()}): ${formatBytes(result.ok ?? 0n)}`
  );
};

const listUploads = async (client, space, limit = 50, cursor) => {
  await ensureCurrentSpace(client, space);
  const out = await client.capability.upload.list({
    size: Math.max(1, Math.min(limit, 500)),
    cursor
  });
  return out?.results ?? [];
};

const listUploadsPage = async (client, space, limit = 50, cursor) => {
  await ensureCurrentSpace(client, space);
  const out = await client.capability.upload.list({
    size: Math.max(1, Math.min(limit, 500)),
    cursor
  });
  return out;
};

const listBlobs = async (client, space, limit = 50, cursor) => {
  await ensureCurrentSpace(client, space);
  const out = await client.capability.blob.list({
    size: Math.max(1, Math.min(limit, 500)),
    cursor
  });
  return out?.results ?? [];
};

const listBlobsPage = async (client, space, limit = 50, cursor) => {
  await ensureCurrentSpace(client, space);
  const out = await client.capability.blob.list({
    size: Math.max(1, Math.min(limit, 500)),
    cursor
  });
  return out;
};

const runWithConcurrency = async (items, concurrency, worker) => {
  const limit = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      await worker(items[idx], idx);
    }
  });
  await Promise.allSettled(runners);
};

const deleteUpload = async (client) => {
  const space = await pickSpace(client);
  if (!space) return;
  await ensureCurrentSpace(client, space);

  const rootStr = await tuiPrompt('Delete Upload', 'Upload root CID to remove:');
  if (!rootStr) return;
  const root = CID.parse(rootStr);
  const removeShards = await tuiConfirm(
    'Delete Upload',
    'Delete shards together with this upload? (Keep shards = safer)',
    true
  );
  const confirm = await tuiConfirm(
    'Delete Upload',
    `Confirm remove upload ${rootStr} from space ${space.name}?`,
    true
  );
  if (!confirm) return;

  const log = tuiLogger('Delete Upload');
  log.append(`Space: ${space.name} (${space.did()})`);
  log.append(`Upload: ${rootStr}`);
  log.append(`Remove shards: ${removeShards ? 'yes' : 'no'}`);
  log.append('Removing upload...');
  try {
    if (removeShards) {
      await client.remove(root, { shards: true });
    } else {
      await client.capability.upload.remove(root);
    }
    log.append('Removed.');
    await new Promise((res) => setTimeout(res, 1000));
  } catch (err) {
    log.append(`Failed: ${err?.message || err}`);
  }
};

const deleteBlob = async (client) => {
  const space = await pickSpace(client);
  if (!space) return;
  await ensureCurrentSpace(client, space);

  const id = await tuiPrompt('Delete Blob', 'Blob ID (shard CID or digest base58btc):');
  if (!id) return;
  const digest = normalizeDigest(id);
  const confirm = await tuiConfirm(
    'Delete Blob',
    `Confirm remove blob ${id} from space ${space.name}?`,
    true
  );
  if (!confirm) return;

  const log = tuiLogger('Delete Blob');
  log.append(`Space: ${space.name} (${space.did()})`);
  log.append(`Blob: ${id}`);
  log.append('Removing blob...');
  try {
    const out = await client.capability.blob.remove(digest);
    if (out?.error) {
      log.append(`Failed: ${out.error?.message || out.error}`);
      return;
    }
    log.append(`Removed. Freed: ${formatBytes(out.ok?.size ?? 0)}.`);
    await new Promise((res) => setTimeout(res, 1000));
  } catch (err) {
    log.append(`Failed: ${err?.message || err}`);
  }
};

const purgeSpaceUploads = async (client, mode = 'page') => {
  const space = await pickSpace(client);
  if (!space) return;
  await ensureCurrentSpace(client, space);

  await tuiMessage(
    'Purge Uploads',
    'NOTE: Storacha JS SDK/CLI does not currently expose a hard-delete for spaces. This action will purge uploads from the space (and optionally shards).'
  );
  const removeShards = await tuiConfirm(
    'Purge Uploads',
    'Delete shards together while purging uploads? (Keep shards = safer)',
    true
  );
  const pageSizeInput = await tuiPrompt('Purge Uploads', 'Page size (default 50, max 500):', '50');
  if (pageSizeInput == null) return;
  const pageSize = parseNumberInput(pageSizeInput, 50, 1, 500);
  const concurrencyInput = await tuiPrompt(
    'Purge Uploads',
    'Delete concurrency (default 3):',
    '3'
  );
  if (concurrencyInput == null) return;
  const concurrency = parseNumberInput(concurrencyInput, 3, 1, 10);

  if (mode === 'all') {
    const confirmed = await tuiDangerConfirm(
      'Purge Uploads',
      `Danger: This will purge ALL uploads from space "${space.name}" (${space.did()}). This is irreversible.\nConfirm: Type PURGE then Enter`
    );
    if (!confirmed) return;
    const log = tuiLogger('Purge Uploads');
    log.append(`Space: ${space.name} (${space.did()})`);
    log.append(`Remove shards: ${removeShards ? 'yes' : 'no'}`);
    log.append(`Mode: ALL pages  size=${pageSize} concurrency=${concurrency}`);
    let cursor;
    let removed = 0;
    let scanned = 0;
    while (true) {
      const page = await listUploadsPage(client, space, pageSize, cursor);
      if (page?.error) {
        log.append(`Failed to list uploads: ${page.error?.message || page.error}`);
        break;
      }
      const results = page?.results ?? [];
      cursor = page?.cursor;
      if (!results.length) {
        log.append('No uploads found on this page.');
        break;
      }
      scanned += results.length;
      const roots = results.map((u) => u.root);
      await runWithConcurrency(roots, concurrency, async (root) => {
        const rootStr = root?.toString?.() ?? String(root);
        try {
          if (removeShards) {
            await client.remove(root, { shards: true });
          } else {
            await client.capability.upload.remove(root);
          }
          removed += 1;
          log.append(`Removed: ${rootStr}`);
        } catch (err) {
          log.append(`Failed: ${rootStr} (${err?.message || err})`);
        }
      });
      if (!cursor) break;
    }
    log.append(`Purge complete: removed=${removed} scanned=${scanned}`);
    await new Promise((res) => setTimeout(res, 1000));
    return;
  }

  const uploads = await listUploads(client, space, pageSize);
  const listing = [
    `Uploads to purge (showing up to ${pageSize}): ${uploads.length}`,
    ...uploads.map((u) => `- ${u.root?.toString?.() ?? String(u.root)} shards=${u.shards?.length ?? 0}`)
  ].join('\n');
  await tuiMessage('Purge Uploads', listing, 'Enter: confirm  |  q/esc: cancel  |  ↑↓ scroll');
  const confirmPage = await tuiConfirm(
    'Purge Uploads',
    `Confirm purge ${uploads.length} upload(s) from space ${space.name}?`,
    true
  );
  if (!confirmPage) return;
  const log = tuiLogger('Purge Uploads');
  log.append(`Space: ${space.name} (${space.did()})`);
  log.append(`Remove shards: ${removeShards ? 'yes' : 'no'}`);
  log.append(`Mode: current page  concurrency=${concurrency}`);
  const roots = uploads.map((u) => u.root);
  await runWithConcurrency(roots, concurrency, async (root) => {
    const rootStr = root?.toString?.() ?? String(root);
    try {
      if (removeShards) {
        await client.remove(root, { shards: true });
      } else {
        await client.capability.upload.remove(root);
      }
      log.append(`Removed: ${rootStr}`);
    } catch (err) {
      log.append(`Failed: ${rootStr} (${err?.message || err})`);
    }
  });
  log.append('Purge complete.');
  await new Promise((res) => setTimeout(res, 1000));
};

const purgeSpaceBlobs = async (client, mode = 'all') => {
  const space = await pickSpace(client);
  if (!space) return;
  await ensureCurrentSpace(client, space);

  const pageSizeInput = await tuiPrompt('Purge Blobs', 'Page size (default 50, max 500):', '50');
  if (pageSizeInput == null) return;
  const pageSize = parseNumberInput(pageSizeInput, 50, 1, 500);
  const concurrencyInput = await tuiPrompt('Purge Blobs', 'Delete concurrency (default 3):', '3');
  if (concurrencyInput == null) return;
  const concurrency = parseNumberInput(concurrencyInput, 3, 1, 10);

  if (mode === 'all') {
    const confirmed = await tuiDangerConfirm(
      'Purge Blobs',
      `Danger: This will purge ALL blobs from space "${space.name}" (${space.did()}). This is irreversible.\nConfirm: Type PURGE then Enter`
    );
    if (!confirmed) return;
  }

  const log = tuiLogger('Purge Blobs');
  log.append(`Space: ${space.name} (${space.did()})`);
  log.append(`Mode: ${mode === 'all' ? 'ALL pages' : 'unknown'}  size=${pageSize} concurrency=${concurrency}`);
  let cursor;
  let removed = 0;
  let scanned = 0;
  while (true) {
    const page = await listBlobsPage(client, space, pageSize, cursor);
    const results = page?.results ?? [];
    cursor = page?.cursor;
    if (!results.length) break;
    scanned += results.length;
    const digests = results
      .map((b) => {
        try {
          return normalizeDigest(b?.blob?.digest);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    await runWithConcurrency(digests, concurrency, async (digest) => {
      try {
        const out = await client.capability.blob.remove(digest);
        if (out?.error) {
          log.append(`Failed: ${digestToString(digest)} (${out.error?.message || out.error})`);
          return;
        }
        removed += 1;
        log.append(`Removed: ${digestToString(digest)} freed=${formatBytes(out.ok?.size ?? 0)}`);
      } catch (err) {
        log.append(`Failed: ${digestToString(digest)} (${err?.message || err})`);
      }
    });
    if (!cursor) break;
  }
  log.append(`Purge complete: removed=${removed} scanned=${scanned}`);
  await new Promise((res) => setTimeout(res, 1000));
};

const showUploadDetailsBuilder = (client) => (upload) => {
  const root = upload?.root?.toString?.() ?? String(upload?.root ?? '');
  const shards = Array.isArray(upload?.shards) ? upload.shards : [];
  const shardMeta = shards.map((shard) => {
    const cid = shard?.toString?.() ?? shard?.cid?.toString?.() ?? String(shard?.cid ?? shard ?? '');
    const size = shard?.size ?? shard?.blob?.size ?? shard?.digest?.size ?? null;
    let digestObj = null;
    try {
      digestObj = shard?.digest ? normalizeDigest(shard?.digest) : normalizeDigest(cid);
    } catch {
      digestObj = null;
    }
    const digest = digestObj ? digestToString(digestObj) : '';
    return { cid, size, digest, digestObj, raw: shard };
  });
  const shardLines = shards.map((shard, idx) => {
    const cid = shard?.toString?.() ?? shard?.cid?.toString?.() ?? String(shard?.cid ?? shard ?? '');
    const size = shard?.size ?? shard?.blob?.size ?? shard?.digest?.size ?? null;
    return `  ${idx + 1}. ${cid} ${size != null ? `(${formatBytes(size)})` : ''}`;
  });
  const size = upload?.size ?? upload?.bytes ?? upload?.root?.size ?? sumShardSizes(upload?.shards);
  const time = formatTime(pickTimestamp(upload));
  const info = [
    `Root: ${root}`,
    `Size: ${formatBytes(size)}`,
    `At: ${time}`,
    `Shards: ${shards.length}`
  ];
  if (shardLines.length) {
    info.push('', 'Shard list:', ...shardLines);
  }
  return {
    title: 'Upload Details',
    content: info.join('\n'),
    onLineEnter: async (lineIndex) => {
      const shardStart = shardLines.length ? shardLines[0] : null;
      if (!shardStart) return null;
      const shardHeaderIndex = info.findIndex((line) => line === 'Shard list:');
      if (shardHeaderIndex < 0) return null;
      const shardLineStart = shardHeaderIndex + 1;
      const shardIdx = lineIndex - shardLineStart;
      if (shardIdx < 0 || shardIdx >= shardMeta.length) return null;
      const shard = shardMeta[shardIdx];
      let size = shard.size;
      if (!size && shard.digestObj) {
        const info = await fetchBlobInfo(client, shard.digestObj);
        if (info?.size != null) {
          size = info.size;
          shard.size = size;
        }
      }
      const details = [
        `CID: ${shard.cid || '--'}`,
        `Size: ${formatBytes(size)}`,
        shard.digest ? `Digest: ${shard.digest}` : null
      ].filter(Boolean);
      return { title: `Shard ${shardIdx + 1}`, content: details.join('\n') };
    }
  };
};

const listUploadsTui = async (client) => {
  const space = await pickSpace(client);
  if (!space) return;
  const pageSizeInput = await tuiPrompt('Uploads', 'Page size (default 50, max 500):', '50');
  if (pageSizeInput == null) return;
  const pageSize = parseNumberInput(pageSizeInput, 50, 1, 500);
  const showUploadDetails = showUploadDetailsBuilder(client);
  await paginateList({
    title: `Uploads (${space.name || space.did()})`,
    pageSize,
    fetchPage: (cursor, size) => listUploadsPage(client, space, size, cursor),
    onSelect: showUploadDetails,
    onSelectLabel: 'view details',
    renderItem: (u, idx) => {
      const root = u.root?.toString?.() ?? String(u.root);
      const shards = u.shards?.length ?? 0;
      const size = u.size ?? u.bytes ?? u?.root?.size ?? sumShardSizes(u.shards);
      const time = formatTime(pickTimestamp(u));
      const sizeLabel = formatBytes(size);
      const headerColumns = ['#', 'ROOT', 'SIZE', 'AT', 'SHARDS'];
      return {
        headerColumns,
        headerText: `  ${padStart('#', 3)} ${padEnd('ROOT', 58)} ${padStart('SIZE', 10)}  ${padEnd('AT', 22)} SHARDS`,
        divider: `  ${'-'.repeat(3)} ${'-'.repeat(58)} ${'-'.repeat(10)}  ${'-'.repeat(22)} ${'-'.repeat(6)}`,
        line: `  ${padStart(idx + 1, 3)} ${padEnd(root, 58)} ${padStart(sizeLabel, 10)}  ${padEnd(time, 22)} ${padStart(shards, 6)}`,
        columns: [String(idx + 1), root, sizeLabel, time, String(shards)]
      };
    }
  });
};

const listBlobsTui = async (client) => {
  const space = await pickSpace(client);
  if (!space) return;
  const pageSizeInput = await tuiPrompt('Blobs', 'Page size (default 50, max 500):', '50');
  if (pageSizeInput == null) return;
  const pageSize = parseNumberInput(pageSizeInput, 50, 1, 500);
  await paginateList({
    title: `Blobs (${space.name || space.did()})`,
    pageSize,
    fetchPage: (cursor, size) => listBlobsPage(client, space, size, cursor),
    renderItem: (b, idx) => {
      const digest = digestToString(b?.blob?.digest);
      const size = b?.blob?.size ?? b?.size;
      const time = formatTime(pickTimestamp(b) ?? pickTimestamp(b?.blob));
      const sizeLabel = formatBytes(size);
      const cause = b?.cause ?? '--';
      const headerColumns = ['#', 'DIGEST', 'SIZE', 'AT', 'CAUSE'];
      return {
        headerColumns,
        headerText: `  ${padStart('#', 3)} ${padEnd('DIGEST', 52)} ${padStart('SIZE', 10)}  ${padEnd('AT', 22)} CAUSE`,
        divider: `  ${'-'.repeat(3)} ${'-'.repeat(52)} ${'-'.repeat(10)}  ${'-'.repeat(22)} ${'-'.repeat(10)}`,
        line: `  ${padStart(idx + 1, 3)} ${padEnd(digest, 52)} ${padStart(sizeLabel, 10)}  ${padEnd(time, 22)} ${cause}`,
        columns: [String(idx + 1), digest, sizeLabel, time, String(cause)]
      };
    }
  });
};

export {
  createClient,
  listSpaces,
  showSpaceUsage,
  listRateLimits,
  purgeSpaceUploads,
  purgeSpaceBlobs,
  deleteUpload,
  deleteBlob,
  listUploadsTui,
  listBlobsTui
};
