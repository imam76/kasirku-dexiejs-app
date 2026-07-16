import { spawn } from 'node:child_process';

const runBun = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    shell: false,
  });

  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`bun ${args.join(' ')} stopped by signal ${signal}`));
      return;
    }

    if (code !== 0) {
      reject(new Error(`bun ${args.join(' ')} exited with code ${code}`));
      return;
    }

    resolve();
  });
});

try {
  await runBun(['run', 'clean:dexie']);
  await runBun(['run', 'tauri', 'dev']);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
