import { spawn } from 'node:child_process';
import { adoptLegacyMigrationHistoryIfNeeded } from './legacy-prisma-baseline.mjs';

const isVercelProduction = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';

if (isVercelProduction) {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for a production Vercel build.');
  }

  const adoption = await adoptLegacyMigrationHistoryIfNeeded({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.POSTGRES_SSL === 'true',
    resolveMigration: (migration) =>
      runNpm(['exec', '--', 'prisma', 'migrate', 'resolve', '--applied', migration]),
  });
  console.log(adoption.message);
  await runNpm(['run', 'db:migrate:deploy']);
  await runNpm(['run', 'rag:schedules:sync', '--', '--config', 'config/rag-sources.json']);
} else {
  console.log(
    'Skipping production database migrations and RAG schedule sync outside a production Vercel build.',
  );
}

function runNpm(args) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit' });

    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(
        new Error(
          signal
            ? `Production migration command exited after ${signal}.`
            : `Production migration command exited with code ${code ?? 'unknown'}.`,
        ),
      );
    });
  });
}
