import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type {
  KnowledgeEvidenceBinding,
  KnowledgeEvidenceHealth,
  KnowledgeMapDraftNode,
  KnowledgeMapNodeDetail,
  KnowledgeMapRelationship,
  PublishedKnowledgeMap,
  RagKnowledgeMapDraft,
  SourceProvenance,
} from '@onboarding/shared';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';

export class KnowledgeMapNotFoundError extends Error {
  constructor() {
    super('Knowledge map not found');
    this.name = 'KnowledgeMapNotFoundError';
  }
}

export class KnowledgeMapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeMapValidationError';
  }
}

export interface CreateKnowledgeMapDraftInput {
  slug: string;
  title: string;
  description?: string;
  accessScope: string;
  draft: RagKnowledgeMapDraft;
}

export interface KnowledgeMapRepositoryPort {
  getPublished(accessScopes: string[], mapId?: string): Promise<PublishedKnowledgeMap>;
  proposeFromSources(objective: string, sourceIds: string[]): Promise<RagKnowledgeMapDraft>;
  getNodeDetail(
    mapVersionId: string,
    nodeId: string,
    accessScopes: string[],
  ): Promise<KnowledgeMapNodeDetail>;
  search(
    mapVersionId: string,
    query: string,
    accessScopes: string[],
  ): Promise<KnowledgeMapNodeDetail[]>;
  createDraft(
    input: CreateKnowledgeMapDraftInput,
    actorUserId: string,
  ): Promise<{ mapId: string; versionId: string }>;
  publish(
    mapId: string,
    versionId: string,
    actorUserId: string,
    changeNote?: string,
  ): Promise<void>;
  submitFeedback(
    input: {
      mapVersionId: string;
      nodeId?: string;
      messageId?: string;
      category: string;
      comment?: string;
    },
    actorUserId: string,
  ): Promise<void>;
  accessScopesFor(accountId: string): Promise<string[]>;
}

type VersionRow = {
  map_id: string;
  version_id: string;
  version_number: number;
  title: string;
  description: string | null;
};

type NodeRow = {
  id: string;
  stable_key: string;
  kind: KnowledgeMapNodeDetail['kind'];
  title: string;
  summary: string;
  owner: string | null;
  controlling_document_required: boolean;
  evidence_health: KnowledgeEvidenceHealth | null;
};

type EdgeRow = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relationship: KnowledgeMapRelationship;
  rationale: string | null;
};

type ProposalSourceRow = {
  source_id: string;
  source_version_id: string;
  title: string;
  excerpt: string;
  owner: string;
};

export class PrismaKnowledgeMapRepository implements KnowledgeMapRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async getPublished(accessScopes: string[], mapId?: string): Promise<PublishedKnowledgeMap> {
    const version = await this.findPublishedVersion(accessScopes, mapId);
    const nodes = await this.loadNodes(version.version_id, accessScopes);
    const allowedIds = new Set(nodes.map((node) => node.id));
    const edges = await this.loadEdges(version.version_id, allowedIds);

    return {
      id: version.map_id,
      versionId: version.version_id,
      versionNumber: version.version_number,
      title: version.title,
      ...(version.description ? { description: version.description } : {}),
      nodes,
      edges,
    };
  }

  async proposeFromSources(objective: string, sourceIds: string[]): Promise<RagKnowledgeMapDraft> {
    const sources = await this.db.knowledgeSource.findMany({
      where: { id: { in: sourceIds }, currentVersionId: { not: null } },
      include: { currentVersion: true },
    });
    const rows: ProposalSourceRow[] = [];
    for (const source of sources) {
      if (!source.currentVersion) continue;
      const chunk = await this.db.knowledgeChunk.findFirst({
        where: { sourceId: source.id, sourceVersionId: source.currentVersion.id },
        orderBy: { updatedAt: 'desc' },
        select: { excerpt: true },
      });
      if (chunk) {
        rows.push({
          source_id: source.id,
          source_version_id: source.currentVersion.id,
          title: source.title,
          excerpt: chunk.excerpt,
          owner: source.owner,
        });
      }
    }
    if (!rows.length) {
      throw new KnowledgeMapValidationError('No current reviewed source chunks were found.');
    }
    const grouped = groupSourcesByDomain(rows);
    const nodes: KnowledgeMapDraftNode[] = [];
    const edges: RagKnowledgeMapDraft['edges'] = [];

    for (const group of grouped) {
      const domainClientKey = `domain-${group.domain.key}`;
      nodes.push({
        clientKey: domainClientKey,
        suggestedStableKey: domainClientKey,
        kind: 'concept',
        title: group.domain.title,
        summary: group.domain.summary,
        evidence: group.sources.map(toAuthoritativeBinding),
      });

      for (const [sourceIndex, row] of group.sources.entries()) {
        const clientKey = `${domainClientKey}-source-${sourceIndex + 1}`;
        const evidence = [toAuthoritativeBinding(row)];
        nodes.push({
          clientKey,
          suggestedStableKey: `${group.domain.key}-${slugify(row.title) || 'source'}-${sourceIndex + 1}`,
          kind: group.domain.nodeKind,
          title: row.title,
          summary: row.excerpt.slice(0, 500),
          owner: row.owner,
          evidence,
        });
        edges.push({
          clientKey: `${domainClientKey}-contains-${sourceIndex + 1}`,
          fromClientKey: domainClientKey,
          toClientKey: clientKey,
          relationship: 'contains',
          rationale: `${row.title} belongs to the ${group.domain.title} onboarding domain.`,
          evidence,
        });
      }
    }

    return {
      objective,
      nodes,
      edges,
    };
  }

  async getNodeDetail(
    mapVersionId: string,
    nodeId: string,
    accessScopes: string[],
  ): Promise<KnowledgeMapNodeDetail> {
    const nodes = await this.loadNodes(mapVersionId, accessScopes, nodeId);
    const node = nodes[0];
    if (!node) throw new KnowledgeMapNotFoundError();
    return node;
  }

  async search(
    mapVersionId: string,
    query: string,
    accessScopes: string[],
  ): Promise<KnowledgeMapNodeDetail[]> {
    const normalized = query.trim();
    if (!normalized) return [];
    const nodes = await this.db.knowledgeMapNode.findMany({
      where: {
        mapVersionId,
        accessScope: { in: accessScopes },
        OR: [
          { title: { contains: normalized, mode: 'insensitive' } },
          { summary: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      take: 20,
    });
    const health = await this.db.knowledgeMapEvidenceHealth.findMany({
      where: { mapVersionId, targetType: 'node', targetId: { in: nodes.map((node) => node.id) } },
    });
    const healthById = new Map(health.map((item) => [item.targetId, item.state]));
    const rows: NodeRow[] = nodes.map((node) => ({
      id: node.id,
      stable_key: node.stableKey,
      kind: node.kind as KnowledgeMapNodeDetail['kind'],
      title: node.title,
      summary: node.summary,
      owner: node.owner,
      controlling_document_required: node.controllingDocumentRequired,
      evidence_health:
        (healthById.get(node.id) as KnowledgeEvidenceHealth | undefined) ?? 'needs_review',
    }));
    const sources = await this.loadSources(
      rows.map((row) => row.id),
      accessScopes,
    );
    return rows.map((row) => toNode(row, sources.get(row.id) ?? []));
  }

  async createDraft(
    input: CreateKnowledgeMapDraftInput,
    actorUserId: string,
  ): Promise<{ mapId: string; versionId: string }> {
    validateDraft(input.draft);

    return this.db.$transaction(async (db) => {
      const mapId = randomUUID();
      const versionId = randomUUID();
      const now = new Date().toISOString();
      await db.knowledgeMap.create({
        data: {
          id: mapId,
          slug: input.slug,
          title: input.title,
          description: input.description,
          defaultAccessScope: input.accessScope,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      await db.knowledgeMapVersion.create({
        data: {
          id: versionId,
          mapId,
          versionNumber: 1,
          status: 'draft',
          changeNote: `RAG proposal: ${input.draft.objective}`,
          createdBy: actorUserId,
          createdAt: new Date(now),
        },
      });
      await insertDraft(db, versionId, input.accessScope, input.draft);
      await insertAudit(db, actorUserId, 'knowledge_map.draft_create', mapId, versionId);
      return { mapId, versionId };
    });
  }

  async publish(
    mapId: string,
    versionId: string,
    actorUserId: string,
    changeNote?: string,
  ): Promise<void> {
    await this.db.$transaction(async (db) => {
      const validation = await validateVersion(db, mapId, versionId);
      if (!validation.valid) throw new KnowledgeMapValidationError(validation.message);
      const now = new Date().toISOString();
      const updated = await db.knowledgeMapVersion.updateMany({
        where: { id: versionId, mapId, status: 'draft' },
        data: {
          status: 'published',
          publishedBy: actorUserId,
          publishedAt: new Date(now),
          ...(changeNote ? { changeNote } : {}),
        },
      });
      if (updated.count !== 1) throw new KnowledgeMapNotFoundError();
      await db.knowledgeMap.update({
        where: { id: mapId },
        data: { currentVersionId: versionId, updatedAt: new Date(now) },
      });
      await insertAudit(db, actorUserId, 'knowledge_map.publish', mapId, versionId, { changeNote });
    });
  }

  async submitFeedback(
    input: {
      mapVersionId: string;
      nodeId?: string;
      messageId?: string;
      category: string;
      comment?: string;
    },
    actorUserId: string,
  ): Promise<void> {
    await this.db.knowledgeMapFeedback.create({
      data: {
        id: randomUUID(),
        mapVersionId: input.mapVersionId,
        nodeId: input.nodeId,
        messageId: input.messageId,
        category: input.category,
        comment: input.comment,
        createdBy: actorUserId,
      },
    });
  }

  async accessScopesFor(accountId: string): Promise<string[]> {
    const now = new Date();
    const memberships = await this.db.knowledgeAudienceMembership.findMany({
      where: {
        accountId,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      select: { accessScope: true },
    });
    return memberships.length ? memberships.map((row) => row.accessScope) : ['all_users'];
  }

  private async findPublishedVersion(accessScopes: string[], mapId?: string): Promise<VersionRow> {
    const map = await this.db.knowledgeMap.findFirst({
      where: {
        defaultAccessScope: { in: accessScopes },
        ...(mapId ? { id: mapId } : {}),
        currentVersion: { is: { status: 'published' } },
      },
      orderBy: { updatedAt: 'desc' },
      include: { currentVersion: true },
    });
    if (!map?.currentVersion) throw new KnowledgeMapNotFoundError();
    return {
      map_id: map.id,
      version_id: map.currentVersion.id,
      version_number: map.currentVersion.versionNumber,
      title: map.title,
      description: map.description,
    };
  }

  private async loadNodes(
    mapVersionId: string,
    accessScopes: string[],
    nodeId?: string,
  ): Promise<KnowledgeMapNodeDetail[]> {
    const nodes = await this.db.knowledgeMapNode.findMany({
      where: {
        mapVersionId,
        accessScope: { in: accessScopes },
        ...(nodeId ? { id: nodeId } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
    const health = await this.db.knowledgeMapEvidenceHealth.findMany({
      where: { mapVersionId, targetType: 'node', targetId: { in: nodes.map((node) => node.id) } },
    });
    const healthById = new Map(health.map((item) => [item.targetId, item.state]));
    const rows: NodeRow[] = nodes.map((node) => ({
      id: node.id,
      stable_key: node.stableKey,
      kind: node.kind as KnowledgeMapNodeDetail['kind'],
      title: node.title,
      summary: node.summary,
      owner: node.owner,
      controlling_document_required: node.controllingDocumentRequired,
      evidence_health:
        (healthById.get(node.id) as KnowledgeEvidenceHealth | undefined) ?? 'needs_review',
    }));
    const sources = await this.loadSources(
      rows.map((row) => row.id),
      accessScopes,
    );
    return rows.map((row) => toNode(row, sources.get(row.id) ?? []));
  }

  private async loadSources(
    nodeIds: string[],
    accessScopes: string[],
  ): Promise<Map<string, SourceProvenance[]>> {
    const byNode = new Map<string, SourceProvenance[]>();
    if (!nodeIds.length) return byNode;
    const bindings = await this.db.knowledgeMapSourceBinding.findMany({
      where: { nodeId: { in: nodeIds }, source: { accessScope: { in: accessScopes } } },
      include: { source: true },
    });
    for (const binding of bindings) {
      if (!binding.nodeId) continue;
      const sources = byNode.get(binding.nodeId) ?? [];
      sources.push({
        id: binding.source.id,
        title: binding.source.title,
        excerpt: binding.sectionKey
          ? `Section: ${binding.sectionKey}`
          : 'Approved company knowledge source.',
        uri: binding.source.uri,
        sourceType: 'knowledge_base',
        metadata: {
          sourceVersionId: binding.sourceVersionId ?? undefined,
          sectionKey: binding.sectionKey ?? undefined,
        },
      });
      byNode.set(binding.nodeId, sources);
    }
    return byNode;
  }

  private async loadEdges(mapVersionId: string, allowedIds: Set<string>) {
    if (!allowedIds.size) return [];
    const edges = await this.db.knowledgeMapEdge.findMany({
      where: { mapVersionId },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    return edges
      .map<EdgeRow>((edge) => ({
        id: edge.id,
        from_node_id: edge.fromNodeId,
        to_node_id: edge.toNodeId,
        relationship: edge.relationship as KnowledgeMapRelationship,
        rationale: edge.rationale,
      }))
      .filter((edge) => allowedIds.has(edge.from_node_id) && allowedIds.has(edge.to_node_id))
      .map((edge) => ({
        id: edge.id,
        from: edge.from_node_id,
        to: edge.to_node_id,
        relationship: edge.relationship,
        ...(edge.rationale ? { rationale: edge.rationale } : {}),
      }));
  }
}

const roadmapDomains: Array<{
  key: string;
  title: string;
  summary: string;
  nodeKind: KnowledgeMapDraftNode['kind'];
  keywords: string[];
}> = [
  {
    key: 'tools-access',
    title: 'Tools & Access',
    summary: 'Systems, accounts, devices, security, and access required to begin work.',
    nodeKind: 'system',
    keywords: [
      'access',
      'account',
      'device',
      'login',
      'security',
      'software',
      'system',
      'tool',
      'it',
    ],
  },
  {
    key: 'policies-compliance',
    title: 'Policies & Compliance',
    summary: 'Company rules, required controls, standards, and compliance obligations.',
    nodeKind: 'resource',
    keywords: ['compliance', 'policy', 'rule', 'standard', 'privacy', 'legal', 'risk', 'conduct'],
  },
  {
    key: 'people-culture',
    title: 'People, Roles & Culture',
    summary: 'Teams, responsibilities, communication norms, and company culture.',
    nodeKind: 'role',
    keywords: ['culture', 'manager', 'people', 'role', 'team', 'communication', 'meeting', 'owner'],
  },
  {
    key: 'workflows-operations',
    title: 'Workflows & Operations',
    summary: 'Operational processes, decisions, handoffs, and recurring work.',
    nodeKind: 'workflow',
    keywords: ['workflow', 'process', 'operation', 'handoff', 'approval', 'client', 'procedure'],
  },
  {
    key: 'products-customers',
    title: 'Products & Customers',
    summary: 'Products, services, customers, and the value the company delivers.',
    nodeKind: 'concept',
    keywords: ['customer', 'product', 'service', 'market', 'sales', 'client journey'],
  },
  {
    key: 'training-development',
    title: 'Training & Development',
    summary: 'Required learning, certifications, milestones, and development paths.',
    nodeKind: 'milestone',
    keywords: ['training', 'learn', 'course', 'certification', 'development', 'onboarding'],
  },
];

const fallbackRoadmapDomain = {
  key: 'company-knowledge',
  title: 'Company Knowledge',
  summary: 'Reviewed company knowledge that supports the onboarding journey.',
  nodeKind: 'concept' as const,
  keywords: [],
};

function groupSourcesByDomain(rows: ProposalSourceRow[]) {
  const grouped = new Map<
    string,
    {
      domain: (typeof roadmapDomains)[number] | typeof fallbackRoadmapDomain;
      sources: ProposalSourceRow[];
    }
  >();

  for (const row of rows) {
    const haystack = `${row.title} ${row.excerpt} ${row.owner}`.toLowerCase();
    const domain =
      roadmapDomains.find((candidate) =>
        candidate.keywords.some((keyword) => haystack.includes(keyword)),
      ) ?? fallbackRoadmapDomain;
    const group = grouped.get(domain.key) ?? { domain, sources: [] };
    group.sources.push(row);
    grouped.set(domain.key, group);
  }

  return [...grouped.values()];
}

function toAuthoritativeBinding(row: ProposalSourceRow): KnowledgeEvidenceBinding {
  return {
    sourceId: row.source_id,
    sourceVersionId: row.source_version_id,
    role: 'authoritative',
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function toNode(row: NodeRow, sources: SourceProvenance[]): KnowledgeMapNodeDetail {
  return {
    id: row.id,
    stableKey: row.stable_key,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    ...(row.owner ? { owner: row.owner } : {}),
    controllingDocumentRequired: row.controlling_document_required,
    evidenceHealth: row.evidence_health ?? 'needs_review',
    sources,
  };
}

async function insertDraft(
  db: PrismaDatabase,
  versionId: string,
  accessScope: string,
  draft: RagKnowledgeMapDraft,
): Promise<void> {
  const nodesByKey = new Map<string, { id: string; node: KnowledgeMapDraftNode }>();
  for (const [position, node] of draft.nodes.entries()) {
    const id = randomUUID();
    nodesByKey.set(node.clientKey, { id, node });
    await db.knowledgeMapNode.create({
      data: {
        id,
        mapVersionId: versionId,
        stableKey: node.suggestedStableKey,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        owner: node.owner,
        displayOrder: position,
        accessScope,
      },
    });
    await insertBindings(db, versionId, id, undefined, node.evidence);
    await db.knowledgeMapEvidenceHealth.create({
      data: { mapVersionId: versionId, targetType: 'node', targetId: id, state: 'current' },
    });
  }
  for (const [position, edge] of draft.edges.entries()) {
    const from = nodesByKey.get(edge.fromClientKey);
    const to = nodesByKey.get(edge.toClientKey);
    if (!from || !to) throw new KnowledgeMapValidationError('Edge references an unknown node.');
    const id = randomUUID();
    await db.knowledgeMapEdge.create({
      data: {
        id,
        mapVersionId: versionId,
        fromNodeId: from.id,
        toNodeId: to.id,
        relationship: edge.relationship,
        rationale: edge.rationale,
        displayOrder: position,
      },
    });
    await insertBindings(db, versionId, undefined, id, edge.evidence);
    await db.knowledgeMapEvidenceHealth.create({
      data: { mapVersionId: versionId, targetType: 'edge', targetId: id, state: 'current' },
    });
  }
}

async function insertBindings(
  db: PrismaDatabase,
  versionId: string,
  nodeId: string | undefined,
  edgeId: string | undefined,
  evidence: KnowledgeEvidenceBinding[],
): Promise<void> {
  for (const binding of evidence) {
    await db.knowledgeMapSourceBinding.create({
      data: {
        id: randomUUID(),
        mapVersionId: versionId,
        nodeId,
        edgeId,
        sourceId: binding.sourceId,
        sourceVersionId: binding.sourceVersionId,
        sectionKey: binding.sectionKey,
        evidenceRole: binding.role,
      },
    });
  }
}

function validateDraft(draft: RagKnowledgeMapDraft): void {
  if (!draft.objective.trim() || !draft.nodes.length || draft.nodes.length > 80) {
    throw new KnowledgeMapValidationError('A draft must contain between 1 and 80 nodes.');
  }
  const keys = new Set<string>();
  const stableKeys = new Set<string>();
  for (const node of draft.nodes) {
    if (!node.clientKey || !node.suggestedStableKey || !node.title.trim() || !node.summary.trim()) {
      throw new KnowledgeMapValidationError(
        'Each node requires a key, title, summary, and stable key.',
      );
    }
    if (keys.has(node.clientKey) || stableKeys.has(node.suggestedStableKey)) {
      throw new KnowledgeMapValidationError('Node keys and stable keys must be unique.');
    }
    if (!node.evidence.some((binding) => binding.role === 'authoritative')) {
      throw new KnowledgeMapValidationError('Each node requires authoritative evidence.');
    }
    keys.add(node.clientKey);
    stableKeys.add(node.suggestedStableKey);
  }
  for (const edge of draft.edges) {
    if (
      !keys.has(edge.fromClientKey) ||
      !keys.has(edge.toClientKey) ||
      edge.fromClientKey === edge.toClientKey
    ) {
      throw new KnowledgeMapValidationError('Each edge must connect two different draft nodes.');
    }
  }
}

async function validateVersion(
  db: PrismaDatabase,
  mapId: string,
  versionId: string,
): Promise<{ valid: boolean; message: string }> {
  const version = await db.knowledgeMapVersion.findFirst({
    where: { id: versionId, mapId, status: 'draft' },
    select: { id: true },
  });
  if (!version) return { valid: false, message: 'Draft version was not found.' };
  const ungrounded = await db.knowledgeMapNode.count({
    where: {
      mapVersionId: versionId,
      sourceBindings: { none: { evidenceRole: 'authoritative' } },
    },
  });
  if (ungrounded !== 0) {
    return { valid: false, message: 'Every published node requires authoritative evidence.' };
  }
  return { valid: true, message: '' };
}

async function insertAudit(
  db: PrismaDatabase,
  actorUserId: string,
  action: string,
  mapId: string,
  versionId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.knowledgeMapAuditEvent.create({
    data: {
      id: randomUUID(),
      actorUserId,
      action,
      mapId,
      mapVersionId: versionId,
      metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue,
    },
  });
}
