import { randomUUID } from 'node:crypto';
import type {
  Choice,
  EvidenceReference,
  ExecutionPlan,
  FailurePacket,
  Goal,
  PlanPhase,
  RefinedRequest,
} from './ragWorkflow.contracts';
import { ExecutionPlanSchema } from './ragWorkflow.contracts';
import { sha256 } from './ragWorkflow.refinement';

export const registeredPlanningToolIds = new Set(['grounded-answer', 'knowledge-map-search']);

export function setGoal(refined: RefinedRequest): Goal {
  return {
    statement: refined.canonicalRequest,
    successCriteria: [
      refined.intent === 'navigate'
        ? 'Return authorized matching knowledge-map locations.'
        : 'Return a grounded result that addresses the canonical request.',
      'Include evidence references for company-specific claims.',
    ],
    constraints: [
      'Use only tools registered by the server.',
      'Respect current actor access scopes.',
      'Do not repeat completed side effects.',
    ],
    nonGoals: ['Change the user goal', 'Publish or delete content without explicit authorization'],
  };
}

export function makeChoice(refined: RefinedRequest, evidence: EvidenceReference[]): Choice {
  const useMap = refined.intent === 'navigate';
  return {
    approach: useMap ? 'authorized knowledge-map search' : 'fresh retrieval and grounded synthesis',
    how: useMap
      ? 'Search the current published knowledge map using the canonical request and actor scopes.'
      : 'Retrieve current authorized evidence, then synthesize and verify a bounded response.',
    why: evidence.length
      ? `The approach uses ${evidence.length} current retrieved evidence reference(s) and preserves source provenance.`
      : 'The approach is bounded and will stop if required evidence remains unavailable.',
    evidenceRefs: evidence.map((item) => item.id),
    rejectedAlternatives: [
      {
        approach: 'unrestricted autonomous agent',
        reason: 'It would not provide deterministic tool, authorization, or recovery boundaries.',
      },
    ],
  };
}

export function buildPlan(
  refined: RefinedRequest,
  goal: Goal,
  evidence: EvidenceReference[],
  choice: Choice,
): ExecutionPlan {
  const phase: PlanPhase =
    refined.intent === 'navigate'
      ? {
          phaseId: 'phase-knowledge-map-search',
          phaseRevision: 0,
          title: 'Search the authorized knowledge map',
          dependsOn: [],
          toolId: 'knowledge-map-search',
          input: { query: refined.canonicalRequest },
          expectedOutputSchemaRef: 'knowledge-map-search-output-v1',
          preconditions: ['Actor access scopes are current'],
          successChecks: ['Returned nodes are authorized for the actor'],
          evidenceRefs: evidence.map((item) => item.id),
          impact: 'read_only',
          approval: 'none',
          retryPolicy: 'transient_only',
        }
      : {
          phaseId: 'phase-grounded-answer',
          phaseRevision: 0,
          title: 'Produce the grounded workflow result',
          dependsOn: [],
          toolId: 'grounded-answer',
          input: { query: refined.canonicalRequest },
          expectedOutputSchemaRef: 'grounded-answer-output-v1',
          preconditions: ['Actor access scopes are current'],
          successChecks: ['Output is non-empty', 'Evidence references remain authorized'],
          evidenceRefs: evidence.map((item) => item.id),
          impact: 'read_only',
          approval: 'none',
          retryPolicy: 'transient_only',
        };
  const withoutHash = {
    planId: randomUUID(),
    revision: 0,
    goal,
    contextAssessment: {
      sufficient: evidence.length > 0,
      evidenceRefs: evidence.map((item) => item.id),
      conflicts: [],
      missingCoverage: evidence.length ? [] : ['authorized_evidence'],
    },
    choice,
    phases: [phase],
  };
  return {
    ...withoutHash,
    planHash: sha256(JSON.stringify(withoutHash)),
  };
}

export function validatePlan(plan: ExecutionPlan): ExecutionPlan {
  const parsed = ExecutionPlanSchema.parse(plan);
  const phaseIds = new Set(parsed.phases.map((phase) => phase.phaseId));

  for (const phase of parsed.phases) {
    if (!registeredPlanningToolIds.has(phase.toolId)) {
      throw new PlanValidationError('unknown_tool', phase.phaseId);
    }
    if (phase.dependsOn.some((dependency) => !phaseIds.has(dependency))) {
      throw new PlanValidationError('missing_dependency', phase.phaseId);
    }
    if (phase.impact !== 'read_only' && phase.approval === 'none') {
      throw new PlanValidationError('approval_required', phase.phaseId);
    }
  }

  assertAcyclic(parsed.phases);
  return parsed;
}

export function correctPlanPhase(plan: ExecutionPlan, failure: FailurePacket): ExecutionPlan {
  const completed = new Set(failure.completedPhaseIds);
  const failed = plan.phases.find((phase) => phase.phaseId === failure.phaseId);
  if (!failed) throw new PlanValidationError('failed_phase_not_found', failure.phaseId);
  if (completed.has(failed.phaseId)) {
    throw new PlanValidationError('completed_phase_cannot_be_replanned', failed.phaseId);
  }

  const affected = dependentPhaseIds(plan.phases, failed.phaseId);
  const phases = plan.phases.map((phase) => {
    if (phase.phaseId !== failed.phaseId && !affected.has(phase.phaseId)) return phase;
    if (completed.has(phase.phaseId)) return phase;

    if (phase.phaseId !== failed.phaseId) {
      return {
        ...phase,
        phaseRevision: phase.phaseRevision + 1,
      };
    }

    const correctedToolId =
      failure.errorCode === 'knowledge_map_unavailable' ? 'grounded-answer' : phase.toolId;
    return {
      ...phase,
      phaseRevision: phase.phaseRevision + 1,
      toolId: correctedToolId,
      title: `${phase.title} (corrected)`,
      input: {
        ...phase.input,
        correctionReason: failure.safeMessage,
      },
    };
  });

  const revised = {
    ...plan,
    revision: plan.revision + 1,
    phases,
    choice: {
      ...plan.choice,
      why: `${plan.choice.why} The failed phase was revised after ${failure.errorCode}.`,
    },
  };
  return validatePlan({
    ...revised,
    planHash: sha256(JSON.stringify({ ...revised, planHash: undefined })),
  });
}

export class PlanValidationError extends Error {
  constructor(
    readonly code: string,
    readonly phaseId?: string,
  ) {
    super(`Invalid workflow plan: ${code}${phaseId ? ` (${phaseId})` : ''}`);
    this.name = 'PlanValidationError';
  }
}

function assertAcyclic(phases: PlanPhase[]): void {
  const dependencies = new Map(phases.map((phase) => [phase.phaseId, phase.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (phaseId: string) => {
    if (visiting.has(phaseId)) throw new PlanValidationError('cyclic_dependency', phaseId);
    if (visited.has(phaseId)) return;
    visiting.add(phaseId);
    for (const dependency of dependencies.get(phaseId) ?? []) visit(dependency);
    visiting.delete(phaseId);
    visited.add(phaseId);
  };

  for (const phase of phases) visit(phase.phaseId);
}

function dependentPhaseIds(phases: PlanPhase[], rootId: string): Set<string> {
  const affected = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const phase of phases) {
      if (
        !affected.has(phase.phaseId) &&
        phase.dependsOn.some((dependency) => dependency === rootId || affected.has(dependency))
      ) {
        affected.add(phase.phaseId);
        changed = true;
      }
    }
  }
  return affected;
}
