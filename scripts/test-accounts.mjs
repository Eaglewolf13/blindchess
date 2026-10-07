import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

// The production bundle is always restored, even if an emulator test fails.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script with npm run test:accounts.');
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.APEX_TEST_PORT = String(server.address().port);
await new Promise((resolve) => server.close(resolve));
const run = (args, env = process.env) =>
  spawnSync(process.execPath, [npmCli, ...args], { stdio: 'inherit', env }).status ?? 1;
let status = run(['run', 'build'], { ...process.env, VITE_FIREBASE_EMULATORS: 'true' });
try {
  if (!status)
    status =
      spawnSync(
        process.execPath,
        [
          'node_modules/firebase-tools/lib/bin/firebase.js',
          'emulators:exec',
          '--project',
          'demo-apex',
          '--only',
          'auth,firestore',
          'npm run test:cloud',
        ],
        { stdio: 'inherit', env: process.env },
      ).status ?? 1;
} finally {
  const restored = run(['run', 'build'], { ...process.env, VITE_FIREBASE_EMULATORS: 'false' });
  if (!status) status = restored;
}
process.exitCode = status;
console.log(`Account verification exit code: ${status}`);
