import { createHash } from 'node:crypto';
import type { OnboardingSession } from '@onboarding/shared';
import type { RefinedRequest, WorkflowStartInput } from './ragWorkflow.contracts';

export interface RefinementContext {
  referencedEntity?: {
    title: string;
    evidenceRef: string;
  };
  recentEntity?: {
    title: string;
    evidenceRef: string;
  };
}

const terminology: Array<{ aliases: string[]; canonical: string; glossaryRef: string }> = [
  {
    aliases: ['onboarding plan', 'learning plan', 'training plan'],
    canonical: 'onboarding plan',
    glossaryRef: 'glossary:onboarding-plan',
  },
  {
    aliases: ['guide map', 'roadmap', 'knowledge graph'],
    canonical: 'knowledge map',
    glossaryRef: 'glossary:knowledge-map',
  },
  {
    aliases: ['way finder', 'way-finder'],
    canonical: 'Wayfinder',
    glossaryRef: 'glossary:wayfinder',
  },
];

const ambiguousPronounPattern = /\b(it|this|that|they|them|those|these)\b/i;

export function buildRefinementContext(
  session: OnboardingSession,
  input: WorkflowStartInput,
): RefinementContext {
  const referencedNode = input.referencedNodeId
    ? session.guide.nodes[input.referencedNodeId]
    : undefined;
  const recentGuideReference = [...session.chatHistory]
    .reverse()
    .flatMap((message) => message.roadmapReferences ?? [])
    .find((reference) => reference.title.trim());

  return {
    ...(referencedNode
      ? {
          referencedEntity: {
            title: referencedNode.title,
            evidenceRef: `guide-node:${referencedNode.id}`,
          },
        }
      : {}),
    ...(recentGuideReference
      ? {
          recentEntity: {
            title: recentGuideReference.title,
            evidenceRef: `knowledge-map-node:${recentGuideReference.nodeId}`,
          },
        }
      : {}),
  };
}

export function refineInput(
  input: WorkflowStartInput,
  context: RefinementContext,
  revision = 0,
  clarification?: string,
): RefinedRequest {
  const combinedInput = clarification
    ? `${input.message.trim()} Clarification: ${clarification.trim()}`
    : input.message.trim();
  const entity = context.referencedEntity ?? context.recentEntity;
  const resolvedReferences: RefinedRequest['resolvedReferences'] = [];
  let canonicalRequest = combinedInput;

  if (ambiguousPronounPattern.test(canonicalRequest) && entity) {
    canonicalRequest = canonicalRequest.replace(
      new RegExp(ambiguousPronounPattern.source, 'gi'),
      (original) => {
        resolvedReferences.push({
          original,
          replacement: entity.title,
          evidenceRef: entity.evidenceRef,
          confidence: context.referencedEntity ? 0.98 : 0.85,
        });
        return entity.title;
      },
    );
  }

  const termMappings: RefinedRequest['termMappings'] = [];
  for (const entry of terminology) {
    for (const alias of entry.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi');
      if (!pattern.test(canonicalRequest)) continue;
      canonicalRequest = canonicalRequest.replace(pattern, (original) => {
        if (original.toLowerCase() !== entry.canonical.toLowerCase()) {
          termMappings.push({
            original,
            canonical: entry.canonical,
            glossaryRef: entry.glossaryRef,
          });
        }
        return entry.canonical;
      });
    }
  }

  const missingFields: string[] = [];
  if (ambiguousPronounPattern.test(canonicalRequest) && !entity && !clarification) {
    missingFields.push('referenced_entity');
  }
  if (significantTerms(canonicalRequest).length < 2) {
    missingFields.push('requested_outcome');
  }

  return {
    revision,
    originalInputHash: sha256(input.message),
    canonicalRequest: normalizeWhitespace(canonicalRequest),
    intent: classifyIntent(canonicalRequest),
    resolvedReferences,
    termMappings,
    knownContextRefs: entity ? [entity.evidenceRef] : [],
    missingFields: [...new Set(missingFields)],
    assumptions: [],
    status: missingFields.length ? 'needs_input' : 'ready',
  };
}

export function clarificationQuestions(refined: RefinedRequest): string[] {
  const questions: string[] = [];
  if (refined.missingFields.includes('referenced_entity')) {
    questions.push('Which specific document, map node, plan, team, or system do you mean?');
  }
  if (refined.missingFields.includes('requested_outcome')) {
    questions.push('What result would you like the workflow to produce?');
  }
  return questions.length ? questions : ['What additional context should the workflow use?'];
}

function classifyIntent(value: string): RefinedRequest['intent'] {
  const normalized = value.toLowerCase();
  if (
    /\b(update|create|change|send|run|execute|publish|delete|ingest|reindex)\b/.test(normalized)
  ) {
    return 'execute';
  }
  if (/\b(draft|write|compose|outline)\b/.test(normalized)) return 'draft';
  if (/\b(find|show|where|navigate|open|locate)\b/.test(normalized)) return 'navigate';
  return 'answer';
}

function significantTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2 && !['the', 'this', 'that', 'what', 'how'].includes(term));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
