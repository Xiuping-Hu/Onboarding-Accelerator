import type { AnswerProvider } from '../../core/ports/answerProvider';
import type { KnowledgeMapService } from '../knowledge-maps/knowledgeMap.application.service';
import type { RagRetriever } from '../rag/rag.service';
import { z } from 'zod';

export type WorkflowFailureClass =
  | 'transient'
  | 'plan_defect'
  | 'verification'
  | 'context_gap'
  | 'authorization'
  | 'unexpected';

export interface AuthorizedToolContext {
  runId: string;
  sessionId: string;
  actorId: string;
  actorRole: 'user' | 'admin';
  accessScopes: string[];
  webSearchEnabled: boolean;
  idempotencyKey: string;
  approved: boolean;
}

export interface ToolVerification {
  valid: boolean;
  safeMessage?: string;
}

export interface WorkflowToolDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  allowedRoles: Array<'user' | 'admin'>;
  impact: 'read_only' | 'reversible' | 'externally_visible' | 'destructive';
  idempotency: 'required' | 'supported' | 'not_applicable';
  timeoutMs: number;
  execute(input: TInput, context: AuthorizedToolContext): Promise<TOutput>;
  verify?(output: TOutput, context: AuthorizedToolContext): Promise<ToolVerification>;
}

export interface ToolExecutionResult {
  toolId: string;
  output: unknown;
  summary: string;
  evidenceRefs: string[];
}

export class WorkflowToolRegistry {
  private readonly definitions: Map<string, WorkflowToolDefinition>;

  constructor(definitions: WorkflowToolDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
    if (this.definitions.size !== definitions.length) {
      throw new Error('Workflow tool IDs must be unique.');
    }
  }

  has(toolId: string): boolean {
    return this.definitions.has(toolId);
  }

  definition(toolId: string): WorkflowToolDefinition | undefined {
    return this.definitions.get(toolId);
  }

  async execute(
    toolId: string,
    input: unknown,
    context: AuthorizedToolContext,
  ): Promise<ToolExecutionResult> {
    const definition = this.definitions.get(toolId);
    if (!definition) {
      throw new WorkflowToolError('plan_defect', 'unknown_tool', `Unknown tool: ${toolId}`);
    }
    if (!definition.allowedRoles.includes(context.actorRole)) {
      throw new WorkflowToolError(
        'authorization',
        'tool_role_forbidden',
        'The current account is not allowed to use this tool.',
      );
    }
    if (definition.impact !== 'read_only' && !context.approved) {
      throw new WorkflowToolError(
        'authorization',
        'tool_approval_required',
        'This tool requires a fresh approval checkpoint.',
      );
    }
    if (definition.idempotency === 'required' && !context.idempotencyKey) {
      throw new WorkflowToolError(
        'plan_defect',
        'idempotency_key_required',
        'The tool requires an idempotency key.',
      );
    }

    const parsedInput = definition.inputSchema.parse(input);
    const output = await withTimeout(
      definition.execute(parsedInput, context),
      definition.timeoutMs,
      toolId,
    );
    const parsedOutput = definition.outputSchema.parse(output);
    const verification = definition.verify
      ? await definition.verify(parsedOutput, context)
      : { valid: true };
    if (!verification.valid) {
      throw new WorkflowToolError(
        'verification',
        'tool_output_verification_failed',
        verification.safeMessage ?? 'The tool output did not pass verification.',
      );
    }

    return {
      toolId,
      output: parsedOutput,
      summary: toolOutputSummary(parsedOutput),
      evidenceRefs: evidenceRefs(parsedOutput),
    };
  }
}

export class WorkflowToolError extends Error {
  constructor(
    readonly failureClass: WorkflowFailureClass,
    readonly code: string,
    safeMessage: string,
  ) {
    super(safeMessage);
    this.name = 'WorkflowToolError';
  }
}

interface ToolRegistryDependencies {
  rag: RagRetriever;
  answers: AnswerProvider;
  knowledgeMaps?: KnowledgeMapService;
}

const queryInputSchema = z
  .object({
    query: z.string().trim().min(1).max(8_000),
    correctionReason: z.string().max(2_000).optional(),
  })
  .strict();

const groundedAnswerOutputSchema = z.object({
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string()),
});

const knowledgeMapOutputSchema = z.object({
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string()),
  nodeIds: z.array(z.string()),
});

export function createWorkflowToolRegistry(
  dependencies: ToolRegistryDependencies,
): WorkflowToolRegistry {
  const groundedAnswer: WorkflowToolDefinition<
    z.infer<typeof queryInputSchema>,
    z.infer<typeof groundedAnswerOutputSchema>
  > = {
    id: 'grounded-answer',
    inputSchema: queryInputSchema,
    outputSchema: groundedAnswerOutputSchema,
    allowedRoles: ['user', 'admin'],
    impact: 'read_only',
    idempotency: 'not_applicable',
    timeoutMs: 30_000,
    execute: async ({ query }, context) => {
      const retrieval = await dependencies.rag.retrieve(query, {
        webSearchEnabled: context.webSearchEnabled,
        allowedAccessScopes: context.accessScopes,
      });
      if (!retrieval.sources.length) {
        throw new WorkflowToolError(
          'context_gap',
          'authorized_evidence_missing',
          'No current authorized evidence was found for the request.',
        );
      }

      try {
        const answer = await dependencies.answers.answer({
          prompt: query,
          sources: retrieval.sources,
        });
        return {
          summary:
            answer?.content ??
            `Grounding sources: ${retrieval.sources
              .slice(0, 3)
              .map((source) => source.title)
              .join(', ')}.`,
          evidenceRefs: retrieval.sources.map((source) => source.id),
        };
      } catch (error) {
        throw new WorkflowToolError(
          'transient',
          'answer_provider_failed',
          error instanceof Error ? error.message : 'The answer provider failed.',
        );
      }
    },
    verify: async (output) => ({
      valid: Boolean(output.summary.trim()) && output.evidenceRefs.length > 0,
      safeMessage: 'The grounded answer was empty or had no evidence.',
    }),
  };

  const knowledgeMapSearch: WorkflowToolDefinition<
    z.infer<typeof queryInputSchema>,
    z.infer<typeof knowledgeMapOutputSchema>
  > = {
    id: 'knowledge-map-search',
    inputSchema: queryInputSchema,
    outputSchema: knowledgeMapOutputSchema,
    allowedRoles: ['user', 'admin'],
    impact: 'read_only',
    idempotency: 'not_applicable',
    timeoutMs: 15_000,
    execute: async ({ query }, context) => {
      if (!dependencies.knowledgeMaps) {
        throw new WorkflowToolError(
          'plan_defect',
          'knowledge_map_unavailable',
          'The knowledge map is not configured.',
        );
      }
      const map = await dependencies.knowledgeMaps.getPublished(context.accessScopes);
      const nodes = await dependencies.knowledgeMaps.search(
        map.versionId,
        query,
        context.accessScopes,
      );
      if (!nodes.length) {
        throw new WorkflowToolError(
          'context_gap',
          'knowledge_map_no_match',
          'No authorized knowledge-map node matched the request.',
        );
      }
      return {
        summary: nodes
          .slice(0, 5)
          .map((node) => `${node.title}: ${node.summary}`)
          .join('\n'),
        evidenceRefs: nodes.flatMap((node) => node.sources.map((source) => source.id)),
        nodeIds: nodes.map((node) => node.id),
      };
    },
    verify: async (output) => ({
      valid: output.nodeIds.length > 0,
      safeMessage: 'The map search returned no authorized nodes.',
    }),
  };

  return new WorkflowToolRegistry([groundedAnswer, knowledgeMapSearch]);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new WorkflowToolError(
            'transient',
            'tool_timeout',
            `Tool ${toolId} exceeded its execution timeout.`,
          ),
        ),
      timeoutMs,
    );
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function toolOutputSummary(output: unknown): string {
  if (
    output &&
    typeof output === 'object' &&
    'summary' in output &&
    typeof output.summary === 'string'
  ) {
    return output.summary.slice(0, 4_000);
  }
  return 'Tool completed successfully.';
}

function evidenceRefs(output: unknown): string[] {
  if (
    output &&
    typeof output === 'object' &&
    'evidenceRefs' in output &&
    Array.isArray(output.evidenceRefs)
  ) {
    return output.evidenceRefs.filter((value): value is string => typeof value === 'string');
  }
  return [];
}
