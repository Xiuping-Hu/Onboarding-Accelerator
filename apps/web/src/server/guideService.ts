import { randomUUID } from 'node:crypto';
import type {
  CreateGuideMapRequest,
  CreateGuideMapResponse,
  DraftGuideMapNode,
  ExpandGuideStepRequest,
  ExpandGuideStepResponse,
  GenerateGuideRootRequest,
  GenerateGuideRootResponse,
  GuideNode,
  SourceProvenance,
} from '@onboarding/shared';
import type { RagRetriever } from './ragService';
import type { SessionRepository } from './sessionRepository';
import { touchSession } from './sessionRepository';

export class GuideOrchestrationService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly rag: RagRetriever,
    private readonly maxDepth = 2,
  ) {}

  async generateRoot(
    sessionId: string,
    request: GenerateGuideRootRequest,
    ownerId: string,
  ): Promise<GenerateGuideRootResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const nodes = session.guide.rootNodeIds
      .map((nodeId) => session.guide.nodes[nodeId])
      .filter((node): node is GuideNode => Boolean(node));

    return {
      rootNodeIds: session.guide.rootNodeIds,
      nodes,
      session,
      sources: collectSources(Object.values(session.guide.nodes)),
    };
  }

  async createMap(
    sessionId: string,
    request: CreateGuideMapRequest,
    ownerId: string,
  ): Promise<CreateGuideMapResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const now = new Date().toISOString();
    const nodesByClientId = new Map<string, GuideNode>();
    const sourceById = new Map<string, SourceProvenance>();

    for (const source of collectDraftSources(request.draftGuideMap.nodes, session)) {
      sourceById.set(source.id, source);
    }

    for (const draftNode of [...request.draftGuideMap.nodes].sort(compareDraftNodes)) {
      const nodeSources = (draftNode.sourceIds ?? [])
        .map((sourceId) => sourceById.get(sourceId))
        .filter((source): source is SourceProvenance => Boolean(source));
      const node = createNode({
        title: draftNode.title,
        summary: draftNode.summary,
        parentId: draftNode.parentClientId
          ? nodesByClientId.get(draftNode.parentClientId)?.id
          : undefined,
        depth: getDraftDepth(draftNode, request.draftGuideMap.nodes),
        sources: nodeSources,
        now,
        detail: draftNode.detail,
        maxDepth: this.maxDepth,
      });
      node.canExpand = false;
      nodesByClientId.set(draftNode.clientId, node);
    }

    for (const draftNode of request.draftGuideMap.nodes) {
      const node = nodesByClientId.get(draftNode.clientId);
      if (!node || !draftNode.parentClientId) {
        continue;
      }

      const parent = nodesByClientId.get(draftNode.parentClientId);
      if (parent) {
        parent.children.push(node.id);
      }
    }

    const rootNodes = request.draftGuideMap.nodes
      .filter((draftNode) => !draftNode.parentClientId)
      .sort(compareDraftNodes)
      .map((draftNode) => nodesByClientId.get(draftNode.clientId))
      .filter((node): node is GuideNode => Boolean(node));

    session.guide.rootNodeIds = rootNodes.map((node) => node.id);
    session.guide.nodes = Object.fromEntries(
      [...nodesByClientId.values()].map((node) => [node.id, node]),
    );
    session.guide.selectedNodeId = rootNodes[0]?.id;
    session.guide.expandedNodeIds = [];

    const savedSession = await this.sessions.save(touchSession(session), ownerId);

    return {
      rootNodeIds: savedSession.guide.rootNodeIds,
      nodes: rootNodes,
      session: savedSession,
      sources: collectSources(Object.values(savedSession.guide.nodes)),
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
      session.guide.selectedNodeId = parent.id;
      session.guide.expandedNodeIds = unique([...session.guide.expandedNodeIds, parent.id]);
      const savedSession = await this.sessions.save(touchSession(session), ownerId);

      return {
        parentNodeId: parent.id,
        childNodeIds: existingChildren.map((node) => node.id),
        nodes: existingChildren,
        session: savedSession,
        sources: existingChildren.flatMap((node) => node.sources),
      };
    }

    session.guide.selectedNodeId = parent.id;
    const savedSession = await this.sessions.save(touchSession(session), ownerId);

    return {
      parentNodeId: parent.id,
      childNodeIds: [],
      nodes: [],
      session: savedSession,
      sources: [],
    };
  }
}

export class GuideNodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Guide node not found: ${nodeId}`);
    this.name = 'GuideNodeNotFoundError';
  }
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function collectSources(nodes: GuideNode[]): SourceProvenance[] {
  const sourceById = new Map<string, SourceProvenance>();
  for (const node of nodes) {
    for (const source of node.sources) {
      sourceById.set(source.id, source);
    }
  }
  return [...sourceById.values()];
}

function collectDraftSources(
  draftNodes: DraftGuideMapNode[],
  session: Awaited<ReturnType<SessionRepository['get']>>,
): SourceProvenance[] {
  const requestedIds = new Set(draftNodes.flatMap((node) => node.sourceIds ?? []));
  return session.chatHistory
    .flatMap((message) => message.sources ?? [])
    .filter((source) => requestedIds.has(source.id));
}

function compareDraftNodes(a: DraftGuideMapNode, b: DraftGuideMapNode): number {
  return a.position - b.position || a.clientId.localeCompare(b.clientId);
}

function getDraftDepth(node: DraftGuideMapNode, nodes: DraftGuideMapNode[]): number {
  const nodesByClientId = new Map(nodes.map((candidate) => [candidate.clientId, candidate]));
  let depth = 0;
  let current = node.parentClientId ? nodesByClientId.get(node.parentClientId) : undefined;

  while (current) {
    depth += 1;
    current = current.parentClientId ? nodesByClientId.get(current.parentClientId) : undefined;
  }

  return depth;
}
