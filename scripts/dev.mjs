import { spawn } from 'node:child_process';

const commands = [
  { name: 'server', args: ['run', 'dev', '-w', '@onboarding/server'] },
  { name: 'teams', args: ['run', 'dev', '-w', '@onboarding/teams-plugin'] },
];

const children = commands.map(({ name, args }) => {
  const child = spawn('npm', args, {
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
    if (signal) {
      console.error(`[${name}] exited after ${signal}`);
      shutdown(1);
    }
  });

  return child;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}
