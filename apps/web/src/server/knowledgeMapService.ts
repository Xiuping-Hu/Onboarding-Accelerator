import { randomUUID } from 'node:crypto';
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
import type { DatabaseClient } from './database';
import { withTransaction } from './database';

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

type SourceRow = {
  node_id: string;
  id: string;
  title: string;
  uri: string;
  source_version_id: string | null;
  section_key: string | null;
};

type ProposalSourceRow = {
  source_id: string;
  source_version_id: string;
  title: string;
  excerpt: string;
  owner: string;
};

export class KnowledgeMapService {
  constructor(private readonly db: DatabaseClient) {}

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
    const result = await this.db.query<ProposalSourceRow>(
      `select distinct on (s.id) s.id as source_id, sv.id as source_version_id,
              s.title, c.excerpt, s.owner
       from knowledge_sources s
       join knowledge_source_versions sv on sv.id = s.current_version_id
       join knowledge_chunks c on c.source_id = s.id and c.source_version_id = sv.id
       where s.id = any($1::text[])
       order by s.id, c.updated_at desc`,
      [sourceIds],
    );
    if (!result.rows.length) {
      throw new KnowledgeMapValidationError('No current reviewed source chunks were found.');
    }
    const grouped = groupSourcesByDomain(result.rows);
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
    const result = await this.db.query<NodeRow>(
      `select n.id, n.stable_key, n.kind, n.title, n.summary, n.owner,
              n.controlling_document_required,
              coalesce(h.state, 'needs_review') as evidence_health
       from knowledge_map_nodes n
       join knowledge_map_versions v on v.id = n.map_version_id
       left join knowledge_map_evidence_health h
         on h.map_version_id = n.map_version_id and h.target_type = 'node' and h.target_id = n.id
       where n.map_version_id = $1
         and n.access_scope = any($2::text[])
         and (n.title ilike '%' || $3 || '%' or n.summary ilike '%' || $3 || '%')
       order by n.display_order, n.title
       limit 20`,
      [mapVersionId, accessScopes, normalized],
    );
    const sources = await this.loadSources(
      result.rows.map((row) => row.id),
      accessScopes,
    );
    return result.rows.map((row) => toNode(row, sources.get(row.id) ?? []));
  }

  async createDraft(
    input: {
      slug: string;
      title: string;
      description?: string;
      accessScope: string;
      draft: RagKnowledgeMapDraft;
    },
    actorUserId: string,
  ): Promise<{ mapId: string; versionId: string }> {
    validateDraft(input.draft);

    return withTransaction(this.db, async (db) => {
      const mapId = randomUUID();
      const versionId = randomUUID();
      const now = new Date().toISOString();
      await db.query(
        `insert into knowledge_maps (id, slug, title, description, default_access_scope, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $6)`,
        [mapId, input.slug, input.title, input.description ?? null, input.accessScope, now],
      );
      await db.query(
        `insert into knowledge_map_versions (id, map_id, version_number, status, change_note, created_by, created_at)
         values ($1, $2, 1, 'draft', $3, $4, $5)`,
        [versionId, mapId, `RAG proposal: ${input.draft.objective}`, actorUserId, now],
      );
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
    await withTransaction(this.db, async (db) => {
      const validation = await validateVersion(db, mapId, versionId);
      if (!validation.valid) throw new KnowledgeMapValidationError(validation.message);
      const now = new Date().toISOString();
      const updated = await db.query(
        `update knowledge_map_versions
         set status = 'published', published_by = $3, published_at = $4,
             change_note = coalesce($5, change_note)
         where id = $1 and map_id = $2 and status = 'draft'`,
        [versionId, mapId, actorUserId, now, changeNote ?? null],
      );
      if (updated.rowCount !== 1) throw new KnowledgeMapNotFoundError();
      await db.query(
        `update knowledge_maps set current_version_id = $2, updated_at = $3 where id = $1`,
        [mapId, versionId, now],
      );
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
    await this.db.query(
      `insert into knowledge_map_feedback
       (id, map_version_id, node_id, message_id, category, comment, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        input.mapVersionId,
        input.nodeId ?? null,
        input.messageId ?? null,
        input.category,
        input.comment ?? null,
        actorUserId,
      ],
    );
  }

  async accessScopesFor(accountId: string): Promise<string[]> {
    const result = await this.db.query<{ access_scope: string }>(
      `select access_scope from knowledge_audience_memberships
       where account_id = $1 and valid_from <= now() and (valid_until is null or valid_until > now())`,
      [accountId],
    );
    return result.rows.length ? result.rows.map((row) => row.access_scope) : ['all_users'];
  }

  private async findPublishedVersion(accessScopes: string[], mapId?: string): Promise<VersionRow> {
    const result = await this.db.query<VersionRow>(
      `select m.id as map_id, v.id as version_id, v.version_number, m.title, m.description
       from knowledge_maps m
       join knowledge_map_versions v on v.id = m.current_version_id and v.status = 'published'
       where m.default_access_scope = any($1::text[])
         and ($2::text is null or m.id = $2)
       order by m.updated_at desc
       limit 1`,
      [accessScopes, mapId ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new KnowledgeMapNotFoundError();
    return row;
  }

  private async loadNodes(
    mapVersionId: string,
    accessScopes: string[],
    nodeId?: string,
  ): Promise<KnowledgeMapNodeDetail[]> {
    const result = await this.db.query<NodeRow>(
      `select n.id, n.stable_key, n.kind, n.title, n.summary, n.owner,
              n.controlling_document_required,
              coalesce(h.state, 'needs_review') as evidence_health
       from knowledge_map_nodes n
       left join knowledge_map_evidence_health h
         on h.map_version_id = n.map_version_id and h.target_type = 'node' and h.target_id = n.id
       where n.map_version_id = $1 and n.access_scope = any($2::text[])
         and ($3::text is null or n.id = $3)
       order by n.display_order, n.title`,
      [mapVersionId, accessScopes, nodeId ?? null],
    );
    const sources = await this.loadSources(
      result.rows.map((row) => row.id),
      accessScopes,
    );
    return result.rows.map((row) => toNode(row, sources.get(row.id) ?? []));
  }

  private async loadSources(
    nodeIds: string[],
    accessScopes: string[],
  ): Promise<Map<string, SourceProvenance[]>> {
    const byNode = new Map<string, SourceProvenance[]>();
    if (!nodeIds.length) return byNode;
    const result = await this.db.query<SourceRow>(
      `select b.node_id, s.id, s.title, s.uri, b.source_version_id, b.section_key
       from knowledge_map_source_bindings b
       join knowledge_sources s on s.id = b.source_id
       where b.node_id = any($1::text[]) and s.access_scope = any($2::text[])`,
      [nodeIds, accessScopes],
    );
    for (const row of result.rows) {
      const sources = byNode.get(row.node_id) ?? [];
      sources.push({
        id: row.id,
        title: row.title,
        excerpt: row.section_key
          ? `Section: ${row.section_key}`
          : 'Approved company knowledge source.',
        uri: row.uri,
        sourceType: 'knowledge_base',
        metadata: {
          sourceVersionId: row.source_version_id ?? undefined,
          sectionKey: row.section_key ?? undefined,
        },
      });
      byNode.set(row.node_id, sources);
    }
    return byNode;
  }

  private async loadEdges(mapVersionId: string, allowedIds: Set<string>) {
    if (!allowedIds.size) return [];
    const result = await this.db.query<EdgeRow>(
      `select id, from_node_id, to_node_id, relationship, rationale
       from knowledge_map_edges where map_version_id = $1 order by display_order, id`,
      [mapVersionId],
    );
    return result.rows
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
  db: DatabaseClient,
  versionId: string,
  accessScope: string,
  draft: RagKnowledgeMapDraft,
): Promise<void> {
  const nodesByKey = new Map<string, { id: string; node: KnowledgeMapDraftNode }>();
  for (const [position, node] of draft.nodes.entries()) {
    const id = randomUUID();
    nodesByKey.set(node.clientKey, { id, node });
    await db.query(
      `insert into knowledge_map_nodes
       (id, map_version_id, stable_key, kind, title, summary, owner, display_order, access_scope)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        versionId,
        node.suggestedStableKey,
        node.kind,
        node.title,
        node.summary,
        node.owner ?? null,
        position,
        accessScope,
      ],
    );
    await insertBindings(db, versionId, id, undefined, node.evidence);
    await db.query(
      `insert into knowledge_map_evidence_health
       (map_version_id, target_type, target_id, state, evaluated_at)
       values ($1, 'node', $2, 'current', now())`,
      [versionId, id],
    );
  }
  for (const [position, edge] of draft.edges.entries()) {
    const from = nodesByKey.get(edge.fromClientKey);
    const to = nodesByKey.get(edge.toClientKey);
    if (!from || !to) throw new KnowledgeMapValidationError('Edge references an unknown node.');
    const id = randomUUID();
    await db.query(
      `insert into knowledge_map_edges
       (id, map_version_id, from_node_id, to_node_id, relationship, rationale, display_order)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, versionId, from.id, to.id, edge.relationship, edge.rationale ?? null, position],
    );
    await insertBindings(db, versionId, undefined, id, edge.evidence);
    await db.query(
      `insert into knowledge_map_evidence_health
       (map_version_id, target_type, target_id, state, evaluated_at)
       values ($1, 'edge', $2, 'current', now())`,
      [versionId, id],
    );
  }
}

async function insertBindings(
  db: DatabaseClient,
  versionId: string,
  nodeId: string | undefined,
  edgeId: string | undefined,
  evidence: KnowledgeEvidenceBinding[],
): Promise<void> {
  for (const binding of evidence) {
    await db.query(
      `insert into knowledge_map_source_bindings
       (id, map_version_id, node_id, edge_id, source_id, source_version_id, section_key, evidence_role)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        versionId,
        nodeId ?? null,
        edgeId ?? null,
        binding.sourceId,
        binding.sourceVersionId ?? null,
        binding.sectionKey ?? null,
        binding.role,
      ],
    );
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
  db: DatabaseClient,
  mapId: string,
  versionId: string,
): Promise<{ valid: boolean; message: string }> {
  const version = await db.query<{ count: string }>(
    `select count(*)::text as count from knowledge_map_versions
     where id = $1 and map_id = $2 and status = 'draft'`,
    [versionId, mapId],
  );
  if (version.rows[0]?.count !== '1')
    return { valid: false, message: 'Draft version was not found.' };
  const ungrounded = await db.query<{ count: string }>(
    `select count(*)::text as count from knowledge_map_nodes n
     where n.map_version_id = $1 and not exists (
       select 1 from knowledge_map_source_bindings b
       where b.node_id = n.id and b.evidence_role = 'authoritative'
     )`,
    [versionId],
  );
  if (ungrounded.rows[0]?.count !== '0') {
    return { valid: false, message: 'Every published node requires authoritative evidence.' };
  }
  return { valid: true, message: '' };
}

async function insertAudit(
  db: DatabaseClient,
  actorUserId: string,
  action: string,
  mapId: string,
  versionId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `insert into knowledge_map_audit_events
     (id, actor_user_id, action, map_id, map_version_id, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [randomUUID(), actorUserId, action, mapId, versionId, JSON.stringify(metadata)],
  );
}
