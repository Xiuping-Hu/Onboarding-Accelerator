import { createHash, randomUUID } from 'node:crypto';
import type { SourceReference } from '@onboarding/shared';
import {
  type CanonicalStaticRoadmap,
  type CanonicalStaticRoadmapStage,
  type GeneratedStaticRoadmap,
  type StaticRoadmapEvidence,
} from './types';

export const semanticsHashVersion = 'completion-semantics-v1';
export const contentHashVersion = 'static-roadmap-content-v1';
export const evidenceHashVersion = 'static-roadmap-evidence-v1';

export class StaticRoadmapValidationError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'StaticRoadmapValidationError';
  }
}

export function canonicalizeGeneratedRoadmap(input: {
  generated: GeneratedStaticRoadmap;
  evidence: StaticRoadmapEvidence[];
  priorSemanticsByKey?: ReadonlyMap<string, string>;
  priorStageKeys?: ReadonlySet<string>;
  lineageBase?: CanonicalStaticRoadmap | null;
}): CanonicalStaticRoadmap {
  const allowedEvidence = new Map(input.evidence.map((item) => [item.id, item]));
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  const stagePositions = new Set<number>();
  const priorStages = new Map(
    (input.lineageBase?.stages ?? []).map((stage) => [stage.stableKey, stage] as const),
  );
  const priorTasks = new Map(
    (input.lineageBase?.stages ?? []).flatMap((stage) =>
      stage.tasks.map((task) => [task.stableKey, task] as const),
    ),
  );

  if (!input.generated.stages.length || input.generated.stages.length > 12) {
    throw new StaticRoadmapValidationError('A static roadmap must contain 1 to 12 stages.');
  }

  let totalTasks = 0;
  const stages: CanonicalStaticRoadmapStage[] = input.generated.stages.map((stage) => {
    assertStableKey(stage.stableKey, 'Stage');
    if (input.priorStageKeys?.has(stage.stableKey) && !priorStages.has(stage.stableKey)) {
      throw new StaticRoadmapValidationError(
        `Stage key ${stage.stableKey} was removed from the captured lineage and cannot be recycled.`,
      );
    }
    if (stageKeys.has(stage.stableKey)) {
      throw new StaticRoadmapValidationError(`Duplicate stage key: ${stage.stableKey}.`);
    }
    if (stagePositions.has(stage.position)) {
      throw new StaticRoadmapValidationError(`Duplicate stage position: ${stage.position}.`);
    }
    if (!stage.tasks.length || stage.tasks.length > 20) {
      throw new StaticRoadmapValidationError(
        `Stage ${stage.stableKey} must contain 1 to 20 tasks.`,
      );
    }
    stageKeys.add(stage.stableKey);
    stagePositions.add(stage.position);
    totalTasks += stage.tasks.length;

    return {
      id: priorStages.get(stage.stableKey)?.id ?? randomUUID(),
      stableKey: stage.stableKey,
      position: stage.position,
      title: requiredText(stage.title, 'Stage title', 200),
      description: requiredText(stage.description, 'Stage description', 4_000),
      dependsOnStageKeys: uniqueKeys(stage.dependsOnStageKeys ?? []).sort(),
      tasks: stage.tasks.map((task, taskIndex) => {
        assertStableKey(task.stableKey, 'Task');
        if (taskKeys.has(task.stableKey)) {
          throw new StaticRoadmapValidationError(`Duplicate task key: ${task.stableKey}.`);
        }
        taskKeys.add(task.stableKey);
        const required = task.required ?? true;
        const countsTowardProgress = task.countsTowardProgress ?? true;
        const weight = task.weight ?? 1;
        if (!Number.isFinite(weight) || weight <= 0 || weight > 10_000) {
          throw new StaticRoadmapValidationError(`Task ${task.stableKey} has an invalid weight.`);
        }
        if (
          task.dueOffsetDays !== undefined &&
          (!Number.isInteger(task.dueOffsetDays) ||
            task.dueOffsetDays < 0 ||
            task.dueOffsetDays > 3_650)
        ) {
          throw new StaticRoadmapValidationError(
            `Task ${task.stableKey} has an invalid due offset.`,
          );
        }
        const sourceReferenceIds = uniqueKeys(task.sourceReferenceIds);
        if (required && !sourceReferenceIds.length) {
          throw new StaticRoadmapValidationError(
            `Required task ${task.stableKey} does not cite captured evidence.`,
          );
        }
        for (const evidenceId of sourceReferenceIds) {
          if (!allowedEvidence.has(evidenceId)) {
            throw new StaticRoadmapValidationError(
              `Task ${task.stableKey} cites evidence outside the captured snapshot.`,
            );
          }
        }
        const semanticsHash = hashTaskSemantics({
          completionCriteria: task.completionCriteria,
          required,
          countsTowardProgress,
          weight,
          dependsOnTaskKeys: task.dependsOnTaskKeys ?? [],
        });
        const priorSemantics = input.priorSemanticsByKey?.get(task.stableKey);
        if (priorSemantics && !priorTasks.has(task.stableKey)) {
          throw new StaticRoadmapValidationError(
            `Task key ${task.stableKey} was removed from the captured lineage and cannot be recycled.`,
          );
        }
        if (priorSemantics && priorSemantics !== semanticsHash) {
          throw new StaticRoadmapValidationError(
            `Task key ${task.stableKey} changes material completion semantics; use a new key.`,
          );
        }
        return {
          id: priorTasks.get(task.stableKey)?.id ?? randomUUID(),
          stableKey: task.stableKey,
          position: taskIndex + 1,
          title: requiredText(task.title, 'Task title', 200),
          ...(task.description
            ? { description: normalizedText(task.description).slice(0, 2_000) }
            : {}),
          completionCriteria: requiredText(task.completionCriteria, 'Completion criteria', 2_000),
          required,
          countsTowardProgress,
          weight,
          ...(task.dueOffsetDays !== undefined ? { dueOffsetDays: task.dueOffsetDays } : {}),
          dependsOnTaskKeys: uniqueKeys(task.dependsOnTaskKeys ?? []).sort(),
          semanticsHash,
          semanticsHashVersion,
          sourceReferenceIds,
        };
      }),
    };
  });

  if (totalTasks > 120) {
    throw new StaticRoadmapValidationError('A static roadmap can contain at most 120 tasks.');
  }
  const orderedPositions = [...stagePositions].sort((a, b) => a - b);
  if (orderedPositions.some((position, index) => position !== index + 1)) {
    throw new StaticRoadmapValidationError('Stage positions must be contiguous starting at 1.');
  }

  for (const stage of stages) {
    assertKnownDependencies(stage.stableKey, stage.dependsOnStageKeys, stageKeys, 'stage');
    for (const task of stage.tasks) {
      assertKnownDependencies(task.stableKey, task.dependsOnTaskKeys, taskKeys, 'task');
    }
  }
  assertAcyclic(
    stages.map((stage) => ({ key: stage.stableKey, dependencies: stage.dependsOnStageKeys })),
    'stage',
  );
  assertAcyclic(
    stages.flatMap((stage) =>
      stage.tasks.map((task) => ({ key: task.stableKey, dependencies: task.dependsOnTaskKeys })),
    ),
    'task',
  );

  const referenced = new Set([
    ...input.generated.sourceReferences,
    ...stages.flatMap((stage) => stage.tasks.flatMap((task) => task.sourceReferenceIds)),
  ]);
  for (const id of referenced) {
    if (!allowedEvidence.has(id)) {
      throw new StaticRoadmapValidationError('The roadmap cites evidence outside the snapshot.');
    }
  }
  const sourceReferences: SourceReference[] = [...referenced]
    .sort()
    .map((id) => toSourceReference(allowedEvidence.get(id)!));

  return {
    title: requiredText(input.generated.title, 'Roadmap title', 200),
    ...(input.generated.summary
      ? { summary: normalizedText(input.generated.summary).slice(0, 2_000) }
      : {}),
    stages: stages.sort((left, right) => left.position - right.position),
    sourceReferences,
    assumptions: (input.generated.assumptions ?? [])
      .map(normalizedText)
      .filter(Boolean)
      .slice(0, 20),
    warnings: (input.generated.warnings ?? []).map(normalizedText).filter(Boolean).slice(0, 20),
  };
}

export function hashTaskSemantics(input: {
  completionCriteria: string;
  required: boolean;
  countsTowardProgress: boolean;
  weight: number;
  dependsOnTaskKeys: string[];
}): string {
  return hashCanonical({
    version: semanticsHashVersion,
    completionCriteria: normalizedText(input.completionCriteria),
    required: input.required,
    countsTowardProgress: input.countsTowardProgress,
    weight: input.weight,
    dependencySemantics: uniqueKeys(input.dependsOnTaskKeys).sort(),
    waiverPolicy: 'allowed-v1',
  });
}

export function hashRoadmapContent(roadmap: CanonicalStaticRoadmap): string {
  return hashCanonical({
    version: contentHashVersion,
    title: normalizedText(roadmap.title),
    stages: roadmap.stages.map((stage) => ({
      stableKey: stage.stableKey,
      position: stage.position,
      title: normalizedText(stage.title),
      description: normalizedText(stage.description),
      dependsOnStageKeys: [...stage.dependsOnStageKeys].sort(),
      tasks: stage.tasks.map((task) => ({
        stableKey: task.stableKey,
        position: task.position,
        title: normalizedText(task.title),
        description: normalizedText(task.description ?? ''),
        completionCriteria: normalizedText(task.completionCriteria),
        required: task.required,
        countsTowardProgress: task.countsTowardProgress,
        weight: task.weight,
        dueOffsetDays: task.dueOffsetDays ?? null,
        dependsOnTaskKeys: [...task.dependsOnTaskKeys].sort(),
        semanticsHash: task.semanticsHash,
      })),
    })),
  });
}

export function hashEvidenceBundle(evidence: StaticRoadmapEvidence[]): string {
  return hashCanonical({
    version: evidenceHashVersion,
    evidence: [...evidence]
      .sort(
        (left, right) =>
          left.queryIndex - right.queryIndex ||
          left.rank - right.rank ||
          left.chunkId.localeCompare(right.chunkId),
      )
      .map((item) => ({
        id: item.id,
        chunkId: item.chunkId,
        sourceId: item.sourceId,
        sourceVersionId: item.sourceVersionId,
        embeddingProfileId: item.embeddingProfileId,
        sectionKey: item.sectionKey ?? null,
        title: normalizedText(item.title),
        excerpt: normalizedText(item.excerpt),
        uri: item.uri ?? null,
        queryIndex: item.queryIndex,
        rank: item.rank,
      })),
  });
}

export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function normalizedText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function toSourceReference(evidence: StaticRoadmapEvidence): SourceReference {
  return {
    id: evidence.id,
    title: evidence.title,
    excerpt: evidence.excerpt,
    href: `/api/onboarding/evidence/${encodeURIComponent(evidence.id)}`,
    sourceType: 'knowledge_base',
    metadata: {
      sourceId: evidence.sourceId,
      sourceVersionId: evidence.sourceVersionId,
      ...(evidence.sectionKey ? { sectionKey: evidence.sectionKey } : {}),
    },
  };
}

function requiredText(value: string, label: string, max: number): string {
  const normalized = normalizedText(value);
  if (!normalized) throw new StaticRoadmapValidationError(`${label} is required.`);
  if (normalized.length > max) {
    throw new StaticRoadmapValidationError(`${label} exceeds ${max} characters.`);
  }
  return normalized;
}

function assertStableKey(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(value) || value.length > 120) {
    throw new StaticRoadmapValidationError(`${label} key is invalid.`);
  }
}

function uniqueKeys(values: string[]): string[] {
  return [...new Set(values)];
}

function assertKnownDependencies(
  key: string,
  dependencies: string[],
  known: Set<string>,
  label: string,
): void {
  if (dependencies.includes(key)) {
    throw new StaticRoadmapValidationError(`${label} ${key} cannot depend on itself.`);
  }
  const unknown = dependencies.find((dependency) => !known.has(dependency));
  if (unknown) {
    throw new StaticRoadmapValidationError(`${label} ${key} has unknown dependency ${unknown}.`);
  }
}

function assertAcyclic(nodes: Array<{ key: string; dependencies: string[] }>, label: string): void {
  const graph = new Map(nodes.map((node) => [node.key, node.dependencies] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visiting.has(key)) {
      throw new StaticRoadmapValidationError(`The ${label} dependency graph has a cycle.`);
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of graph.get(key) ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const node of nodes) visit(node.key);
}
