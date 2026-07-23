import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionPlan, FailurePacket } from './ragWorkflow.contracts';
import { PlanValidationError, correctPlanPhase, validatePlan } from './ragWorkflow.planning';

function plan(): ExecutionPlan {
  return {
    planId: 'plan-1',
    revision: 0,
    goal: {
      statement: 'Answer the onboarding question',
      successCriteria: ['Return a result'],
      constraints: [],
      nonGoals: [],
    },
    contextAssessment: {
      sufficient: true,
      evidenceRefs: ['source-1'],
      conflicts: [],
      missingCoverage: [],
    },
    choice: {
      approach: 'grounded synthesis',
      how: 'Retrieve then answer',
      why: 'It is grounded',
      evidenceRefs: ['source-1'],
      rejectedAlternatives: [],
    },
    phases: [
      {
        phaseId: 'phase-1',
        phaseRevision: 0,
        title: 'First phase',
        dependsOn: [],
        toolId: 'grounded-answer',
        input: { query: 'first' },
        expectedOutputSchemaRef: 'output-v1',
        preconditions: [],
        successChecks: ['non-empty'],
        evidenceRefs: ['source-1'],
        impact: 'read_only',
        approval: 'none',
        retryPolicy: 'transient_only',
      },
      {
        phaseId: 'phase-2',
        phaseRevision: 0,
        title: 'Second phase',
        dependsOn: ['phase-1'],
        toolId: 'grounded-answer',
        input: { query: 'second' },
        expectedOutputSchemaRef: 'output-v1',
        preconditions: [],
        successChecks: ['non-empty'],
        evidenceRefs: ['source-1'],
        impact: 'read_only',
        approval: 'none',
        retryPolicy: 'transient_only',
      },
      {
        phaseId: 'phase-independent',
        phaseRevision: 0,
        title: 'Independent phase',
        dependsOn: [],
        toolId: 'grounded-answer',
        input: { query: 'independent' },
        expectedOutputSchemaRef: 'output-v1',
        preconditions: [],
        successChecks: ['non-empty'],
        evidenceRefs: ['source-1'],
        impact: 'read_only',
        approval: 'none',
        retryPolicy: 'transient_only',
      },
    ],
    planHash: 'hash-1',
  };
}

void test('correction revises only the failed phase and its pending descendants', () => {
  const failure: FailurePacket = {
    runId: 'run-1',
    planRevision: 0,
    phaseId: 'phase-1',
    phaseRevision: 0,
    failureClass: 'plan_defect',
    errorCode: 'wrong_input',
    safeMessage: 'Use the corrected input.',
    inputHash: 'input-hash',
    completedPhaseIds: ['phase-independent'],
    evidenceRefs: ['source-1'],
  };

  const corrected = correctPlanPhase(plan(), failure);

  assert.equal(corrected.revision, 1);
  assert.equal(corrected.phases.find((phase) => phase.phaseId === 'phase-1')?.phaseRevision, 1);
  assert.equal(corrected.phases.find((phase) => phase.phaseId === 'phase-2')?.phaseRevision, 1);
  assert.equal(
    corrected.phases.find((phase) => phase.phaseId === 'phase-independent')?.phaseRevision,
    0,
  );
});

void test('plan validation rejects dependency cycles', () => {
  const invalid = plan();
  invalid.phases[0]!.dependsOn = ['phase-2'];
  assert.throws(() => validatePlan(invalid), PlanValidationError);
});
