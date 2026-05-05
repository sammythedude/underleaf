#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mainEntry = resolve(rootDir, 'dist-electron/main.js');
const targetPath = process.argv[2];

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', mainEntry, ...(targetPath ? [resolve(process.cwd(), targetPath)] : [])],
  {
    cwd: rootDir,
    stdio: 'inherit',
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
