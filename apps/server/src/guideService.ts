import { randomUUID } from 'node:crypto';
import type {
  ExpandGuideStepRequest,
  ExpandGuideStepResponse,
  GenerateGuideRootRequest,
  GenerateGuideRootResponse,
  GuideNode,
  SourceProvenance,
} from '@onboarding/shared';
import type { RagService } from './ragService.js';
import type { SessionRepository } from './sessionRepository.js';
import { touchSession } from './sessionRepository.js';

export class GuideOrchestrationService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly rag: RagService,
    private readonly maxDepth = 2,
  ) {}

  async generateRoot(
    sessionId: string,
    request: GenerateGuideRootRequest,
    ownerId: string,
  ): Promise<GenerateGuideRootResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const prompt = request.prompt?.trim() || 'Create an onboarding guide for a new teammate';
    const webSearchEnabled = request.webSearchEnabled ?? session.settings.webSearchEnabled;
    const retrieval = await this.rag.retrieve(prompt, { webSearchEnabled });
    const now = new Date().toISOString();
    const rootNodes = createRootNodes(retrieval.sources, now, this.maxDepth);

    for (const node of rootNodes) {
      session.guide.nodes[node.id] = node;
    }

    session.guide.rootNodeIds = rootNodes.map((node) => node.id);
    session.guide.selectedNodeId = rootNodes[0]?.id;
    session.guide.expandedNodeIds = [];

    const savedSession = await this.sessions.save(touchSession(session));

    return {
      rootNodeIds: session.guide.rootNodeIds,
      nodes: rootNodes,
      session: savedSession,
      sources: retrieval.sources,
    };
  }

  async expand(
    sessionId: string,
    request: ExpandGuideStepRequest,
    ownerId: string,
  ): Promise<ExpandGuideStepResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const parent = session.guide.nodes[request.nodeId];

    if (!parent) {
      throw new GuideNodeNotFoundError(request.nodeId);
    }

    if (parent.children.length > 0) {
      const existingChildren = parent.children
        .map((childId) => session.guide.nodes[childId])
        .filter((node): node is GuideNode => Boolean(node));

      return {
        parentNodeId: parent.id,
        childNodeIds: existingChildren.map((node) => node.id),
        nodes: existingChildren,
        session,
        sources: existingChildren.flatMap((node) => node.sources),
      };
    }

    if (parent.depth >= this.maxDepth) {
      parent.canExpand = false;
      parent.updatedAt = new Date().toISOString();
      session.guide.selectedNodeId = parent.id;
      const savedSession = await this.sessions.save(touchSession(session));

      return {
        parentNodeId: parent.id,
        childNodeIds: [],
        nodes: [],
        session: savedSession,
        sources: [],
      };
    }

    const prompt =
      request.instruction?.trim() ||
      `Expand onboarding guide step "${parent.title}" into detailed next steps`;
    const webSearchEnabled = request.webSearchEnabled ?? session.settings.webSearchEnabled;
    const retrieval = await this.rag.retrieve(`${parent.title}. ${prompt}`, { webSearchEnabled });
    const now = new Date().toISOString();
    const childNodes = createChildNodes(parent, retrieval.sources, now, this.maxDepth);

    for (const node of childNodes) {
      session.guide.nodes[node.id] = node;
    }

    parent.children.push(...childNodes.map((node) => node.id));
    parent.status = 'expanded';
    parent.canExpand = false;
    parent.updatedAt = now;
    parent.detail = parent.detail || buildDetail(parent.title, retrieval.sources);
    session.guide.selectedNodeId = parent.id;
    session.guide.expandedNodeIds = unique([...session.guide.expandedNodeIds, parent.id]);

    const savedSession = await this.sessions.save(touchSession(session));

    return {
      parentNodeId: parent.id,
      childNodeIds: childNodes.map((node) => node.id),
      nodes: childNodes,
      session: savedSession,
      sources: retrieval.sources,
    };
  }
}

export class GuideNodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Guide node not found: ${nodeId}`);
    this.name = 'GuideNodeNotFoundError';
  }
}

function createRootNodes(
  sources: SourceProvenance[],
  now: string,
  maxDepth: number,
): GuideNode[] {
  const fallbackTitles = [
    'Set up access',
    'Meet the team',
    'Learn the product',
    'Complete training',
  ];
  const selectedSources = sources.length > 0 ? sources.slice(0, 4) : [];
  const titles =
    selectedSources.length > 0 ? selectedSources.map((source) => source.title) : fallbackTitles;

  return titles.map((title, index) => {
    const source = selectedSources[index];

    return createNode({
      title,
      summary:
        source?.excerpt ?? `Start with ${title.toLowerCase()} and collect the required context.`,
      depth: 0,
      sources: source ? [source] : [],
      now,
      maxDepth,
    });
  });
}

function createChildNodes(
  parent: GuideNode,
  sources: SourceProvenance[],
  now: string,
  maxDepth: number,
): GuideNode[] {
  const sourceBacked = sources.slice(0, 3).map((source, index) =>
    createNode({
      title: `${parent.title}: ${source.title}`,
      summary: source.excerpt,
      parentId: parent.id,
      depth: parent.depth + 1,
      sources: [source],
      now,
      detail: buildDetail(source.title, [source], index + 1),
      maxDepth,
    }),
  );

  if (sourceBacked.length > 0) {
    return sourceBacked;
  }

  return ['Understand context', 'Take action', 'Confirm completion'].map((title, index) =>
    createNode({
      title: `${parent.title}: ${title}`,
      summary: `Break "${parent.title}" into a concrete onboarding action.`,
      parentId: parent.id,
      depth: parent.depth + 1,
      sources: [],
      now,
      detail: buildDetail(title, [], index + 1),
      maxDepth,
    }),
  );
}

function createNode(input: {
  title: string;
  summary: string;
  depth: number;
  sources: SourceProvenance[];
  now: string;
  maxDepth: number;
  parentId?: string;
  detail?: string;
}): GuideNode {
  return {
    id: randomUUID(),
    parentId: input.parentId,
    title: input.title,
    summary: input.summary,
    detail: input.detail,
    children: [],
    depth: input.depth,
    status: 'generated',
    sources: input.sources,
    canExpand: input.depth < input.maxDepth,
    maxDepth: input.maxDepth,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function buildDetail(title: string, sources: SourceProvenance[], stepNumber = 1): string {
  const grounding =
    sources.map((source) => source.title).join(', ') || 'the onboarding knowledge base';
  return `Step ${stepNumber}: use ${grounding} to clarify "${title}", identify the owner, and capture the next observable action.`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
