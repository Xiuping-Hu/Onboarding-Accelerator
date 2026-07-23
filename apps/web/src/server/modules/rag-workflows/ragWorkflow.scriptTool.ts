import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { AuthorizedToolContext, WorkflowToolDefinition } from './ragWorkflow.tools';
import { WorkflowToolError } from './ragWorkflow.tools';
import { sha256 } from './ragWorkflow.refinement';

const scriptOutputSchema = z.object({
  summary: z.string(),
  evidenceRefs: z.array(z.string()),
  exitCode: z.number().int(),
  stdoutHash: z.string(),
});

interface ApprovedScriptToolOptions<TInput> {
  id: string;
  entryPoint: string;
  workingDirectory: string;
  inputSchema: z.ZodType<TInput>;
  argumentsFor(input: TInput): string[];
  environment?: Record<string, string>;
  timeoutMs?: number;
}

export function createApprovedScriptTool<TInput>(
  options: ApprovedScriptToolOptions<TInput>,
): WorkflowToolDefinition<TInput, z.infer<typeof scriptOutputSchema>> {
  return {
    id: options.id,
    inputSchema: options.inputSchema,
    outputSchema: scriptOutputSchema,
    allowedRoles: ['admin'],
    impact: 'externally_visible',
    idempotency: 'required',
    timeoutMs: options.timeoutMs ?? 120_000,
    execute: async (input, context) => executeApprovedScript(options, input, context),
    verify: async (output) => ({
      valid: output.exitCode === 0,
      safeMessage: 'The approved script returned a non-zero exit code.',
    }),
  };
}

async function executeApprovedScript<TInput>(
  options: ApprovedScriptToolOptions<TInput>,
  input: TInput,
  context: AuthorizedToolContext,
): Promise<z.infer<typeof scriptOutputSchema>> {
  if (context.actorRole !== 'admin' || !context.approved) {
    throw new WorkflowToolError(
      'authorization',
      'script_approval_required',
      'Administrative scripts require a fresh admin approval.',
    );
  }

  const args = [options.entryPoint, ...options.argumentsFor(input)];
  const output = await new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      let settled = false;
      const child = spawn(process.execPath, args, {
        cwd: options.workingDirectory,
        env: {
          NODE_ENV: process.env.NODE_ENV ?? 'production',
          ...options.environment,
          WORKFLOW_IDEMPOTENCY_KEY: context.idempotencyKey,
        },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = appendBounded(stdout, chunk.toString('utf8'));
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = appendBounded(stderr, chunk.toString('utf8'));
      });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new WorkflowToolError(
            'transient',
            'approved_script_timeout',
            'The approved script exceeded its execution timeout.',
          ),
        );
      }, options.timeoutMs ?? 120_000);
      timer.unref?.();
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    },
  );

  if (output.code !== 0) {
    throw new WorkflowToolError(
      'unexpected',
      'approved_script_failed',
      output.stderr.trim().slice(0, 500) || 'The approved script failed.',
    );
  }
  return {
    summary: output.stdout.trim().slice(0, 2_000) || 'Approved script completed.',
    evidenceRefs: [],
    exitCode: output.code,
    stdoutHash: sha256(output.stdout),
  };
}

function appendBounded(current: string, value: string): string {
  return `${current}${value}`.slice(0, 16_000);
}
