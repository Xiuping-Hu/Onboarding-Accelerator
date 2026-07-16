import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const checkoutKey = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
const lockPath = join(tmpdir(), `onboarding-accelerator-dev-${checkoutKey}.lock`);
const port = parsePort(process.env.PORT);

acquireDevLock();

try {
  await assertPortAvailable(port);
} catch (error) {
  releaseDevLock();
  throw error;
}

const commands = [{ name: 'web', args: ['run', 'dev', '-w', '@onboarding/web'] }];

const children = commands.map(({ name, args }) => {
  const child = spawn('npm', args, {
    shell: true,
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

process.once('exit', releaseDevLock);

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

function parsePort(value) {
  const parsed = Number(value ?? 3000);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return parsed;
}

function acquireDevLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, 'wx');
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, projectRoot, startedAt: new Date().toISOString() }),
      );
      closeSync(descriptor);
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const existingPid = readLockPid();
      if (existingPid && isProcessRunning(existingPid)) {
        throw new Error(
          `A development server is already running for this checkout (PID ${existingPid}). ` +
            'Refusing to start another Next.js process against the same .next cache.',
        );
      }

      unlinkSync(lockPath);
    }
  }

  throw new Error(`Unable to acquire development server lock: ${lockPath}`);
}

function readLockPid() {
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    return Number.isInteger(lock.pid) ? lock.pid : undefined;
  } catch {
    return undefined;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function releaseDevLock() {
  try {
    const ownerPid = readLockPid();
    if (ownerPid === process.pid) {
      unlinkSync(lockPath);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error(`Unable to release development server lock: ${error.message}`);
    }
  }
}

async function assertPortAvailable(candidatePort) {
  await new Promise((resolveAvailability, rejectAvailability) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        rejectAvailability(
          new Error(
            `Port ${candidatePort} is already in use. Refusing to let Next.js choose another port ` +
              'because multiple dev servers in one checkout share and can corrupt the .next cache.',
          ),
        );
        return;
      }
      rejectAvailability(error);
    });
    server.listen({ host: '127.0.0.1', port: candidatePort, exclusive: true }, () => {
      server.close(resolveAvailability);
    });
  });
}
