import { tuiMenu, tuiMessage } from '../tui/index.mjs';
import {
  listSpaces,
  showSpaceUsage,
  listRateLimits,
  purgeSpaceUploads,
  purgeSpaceBlobs,
  deleteUpload,
  deleteBlob,
  listUploadsTui,
  listBlobsTui,
  reloginClient
} from './actions.mjs';

const showSpaces = async (client) => {
  const spaces = listSpaces(client);
  const rows = spaces.map((space) => {
    const did = typeof space.did === 'function' ? space.did() : String(space);
    const name = space?.name ?? '(no name)';
    const access = space?.access?.type ?? '';
    return `- ${name}  ${did}  ${access}`;
  });
  await tuiMessage('Spaces', rows.length ? rows.join('\n') : '(none)');
};

const runMainMenu = async (client, onExit) => {
  let activeClient = client;
  while (true) {
    const idx = await tuiMenu('Storacha Admin', [
      'List spaces',
      'Query space usage',
      'Check rate limits (subject)',
      'Purge uploads (current page)',
      'Purge uploads (ALL pages)',
      'Purge blobs (ALL pages)',
      'Delete an upload (by root CID)',
      'Delete a blob (by shard CID or digest)',
      'List uploads (first page)',
      'List blobs (first page)',
      'Logout and re-login',
      'Exit'
    ]);
    if (idx == null) continue;

    if (idx === 0) {
      await showSpaces(activeClient);
    } else if (idx === 1) {
      await showSpaceUsage(activeClient);
    } else if (idx === 2) {
      await listRateLimits(activeClient);
    } else if (idx === 3) {
      await purgeSpaceUploads(activeClient, 'page');
    } else if (idx === 4) {
      await purgeSpaceUploads(activeClient, 'all');
    } else if (idx === 5) {
      await purgeSpaceBlobs(activeClient, 'all');
    } else if (idx === 6) {
      await deleteUpload(activeClient);
    } else if (idx === 7) {
      await deleteBlob(activeClient);
    } else if (idx === 8) {
      await listUploadsTui(activeClient);
    } else if (idx === 9) {
      await listBlobsTui(activeClient);
    } else if (idx === 10) {
      const nextClient = await reloginClient(activeClient);
      if (nextClient) {
        activeClient = nextClient;
      }
    } else if (idx === 11) {
      if (onExit) onExit();
      break;
    }
  }
};

export { runMainMenu };
