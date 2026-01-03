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
  listBlobsTui
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
      'Exit'
    ]);
    if (idx == null) continue;

    if (idx === 0) {
      await showSpaces(client);
    } else if (idx === 1) {
      await showSpaceUsage(client);
    } else if (idx === 2) {
      await listRateLimits(client);
    } else if (idx === 3) {
      await purgeSpaceUploads(client, 'page');
    } else if (idx === 4) {
      await purgeSpaceUploads(client, 'all');
    } else if (idx === 5) {
      await purgeSpaceBlobs(client, 'all');
    } else if (idx === 6) {
      await deleteUpload(client);
    } else if (idx === 7) {
      await deleteBlob(client);
    } else if (idx === 8) {
      await listUploadsTui(client);
    } else if (idx === 9) {
      await listBlobsTui(client);
    } else if (idx === 10) {
      if (onExit) onExit();
      break;
    }
  }
};

export { runMainMenu };
