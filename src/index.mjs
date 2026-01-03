#!/usr/bin/env node
import process from 'node:process';

import { loadDotEnv } from './config/env.mjs';
import { createClient } from './admin/actions.mjs';
import { runMainMenu } from './admin/menu.mjs';
import { exitApp } from './tui/index.mjs';

const main = async () => {
  loadDotEnv();
  const client = await createClient();
  await runMainMenu(client, exitApp);
};

main().catch((err) => {
  console.error('[storacha-admin-tui] fatal:', err?.stack || err);
  process.exitCode = 1;
});
