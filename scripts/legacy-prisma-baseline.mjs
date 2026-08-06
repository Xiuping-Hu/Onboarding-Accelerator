import { Client } from 'pg';

export const LEGACY_MIGRATIONS = [
  '0001_postgres_pgvector',
  '0002_users_table',
  '0003_postgres_account_auth',
  '0004_rag_source_snapshots',
  '0005_knowledge_embedding_profiles',
  '0006_rag_grounded_knowledge_maps',
  '0007_microsoft_entra_auth',
];

const requiredColumns = {
  onboarding_sessions: [
    'id',
    'owner_id',
    'title',
    'created_at',
    'updated_at',
    'settings',
    'chat_history',
    'guide',
    'revision',
  ],
  knowledge_chunks: [
    'id',
    'title',
    'excerpt',
    'uri',
    'source_type',
    'metadata',
    'embedding',
    'updated_at',
    'embedding_profile',
    'source_id',
    'source_version_id',
    'section_key',
  ],
  users: [
    'id',
    'email',
    'display_name',
    'password_hash',
    'role',
    'is_active',
    'last_login_at',
    'created_at',
    'updated_at',
    'microsoft_tenant_id',
    'microsoft_object_id',
  ],
  auth_sessions: [
    'id',
    'user_id',
    'session_token_hash',
    'expires_at',
    'created_at',
    'last_seen_at',
    'revoked_at',
    'user_agent',
    'ip_address',
  ],
  login_audit_events: [
    'id',
    'user_id',
    'email',
    'event_type',
    'success',
    'reason',
    'ip_address',
    'user_agent',
    'created_at',
  ],
  rag_source_snapshots: ['source_id', 'uri', 'title', 'content', 'metadata', 'captured_at'],
  knowledge_sources: [
    'id',
    'uri',
    'title',
    'owner',
    'access_scope',
    'refresh_cadence',
    'current_version_id',
    'created_at',
    'updated_at',
  ],
  knowledge_source_versions: [
    'id',
    'source_id',
    'content_hash',
    'upstream_updated_at',
    'captured_at',
    'metadata',
  ],
  knowledge_maps: [
    'id',
    'slug',
    'title',
    'description',
    'tenant_id',
    'default_access_scope',
    'current_version_id',
    'created_at',
    'updated_at',
  ],
  knowledge_map_versions: [
    'id',
    'map_id',
    'version_number',
    'status',
    'change_note',
    'created_by',
    'published_by',
    'created_at',
    'published_at',
  ],
  knowledge_map_nodes: [
    'id',
    'map_version_id',
    'stable_key',
    'kind',
    'title',
    'summary',
    'owner',
    'display_order',
    'access_scope',
    'controlling_document_required',
  ],
  knowledge_map_edges: [
    'id',
    'map_version_id',
    'from_node_id',
    'to_node_id',
    'relationship',
    'rationale',
    'display_order',
  ],
  knowledge_map_source_bindings: [
    'id',
    'map_version_id',
    'node_id',
    'edge_id',
    'source_id',
    'source_version_id',
    'section_key',
    'evidence_role',
  ],
  knowledge_map_evidence_health: [
    'map_version_id',
    'target_type',
    'target_id',
    'state',
    'reason',
    'evaluated_at',
  ],
  knowledge_audience_memberships: [
    'account_id',
    'tenant_id',
    'access_scope',
    'assigned_by',
    'valid_from',
    'valid_until',
  ],
  knowledge_map_suggestions: [
    'id',
    'map_version_id',
    'proposal',
    'status',
    'created_by',
    'reviewed_by',
    'created_at',
    'reviewed_at',
  ],
  knowledge_map_feedback: [
    'id',
    'map_version_id',
    'node_id',
    'message_id',
    'category',
    'comment',
    'status',
    'created_by',
    'created_at',
    'resolved_by',
    'resolved_at',
  ],
  knowledge_map_audit_events: [
    'id',
    'actor_user_id',
    'action',
    'map_id',
    'map_version_id',
    'target_id',
    'metadata',
    'created_at',
  ],
};

const requiredIndexes = [
  'onboarding_sessions_owner_updated_idx',
  'knowledge_chunks_embedding_idx',
  'users_email_idx',
  'users_email_normalized_key',
  'users_role_idx',
  'users_active_idx',
  'auth_sessions_active_lookup_idx',
  'auth_sessions_user_active_idx',
  'auth_sessions_expiry_cleanup_idx',
  'login_audit_events_user_created_idx',
  'login_audit_events_email_created_idx',
  'login_audit_events_created_idx',
  'knowledge_chunks_embedding_profile_idx',
  'knowledge_chunks_source_version_idx',
  'users_microsoft_identity_key',
  'users_microsoft_tenant_idx',
];

const requiredConstraints = [
  'login_audit_event_type_check',
  'knowledge_sources_current_version_fk',
  'knowledge_maps_current_version_fk',
];

const requiredExtensions = ['pgcrypto', 'vector'];

export async function adoptLegacyMigrationHistoryIfNeeded({
  connectionString,
  ssl,
  resolveMigration,
}) {
  const client = new Client({
    connectionString,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  await client.connect();
  let snapshot;
  try {
    snapshot = await inspectSchema(client);
  } finally {
    await client.end();
  }

  if (snapshot.tables.has('_prisma_migrations')) {
    return { status: 'managed', message: 'Prisma migration history is already initialized.' };
  }
  if (snapshot.tables.size === 0) {
    return { status: 'empty', message: 'Database schema is empty; no baseline is required.' };
  }

  const mismatches = validateLegacySchema(snapshot);
  if (mismatches.length > 0) {
    throw new Error(
      `Refusing to baseline an unexpected production schema:\n- ${mismatches.join('\n- ')}`,
    );
  }

  for (const migration of LEGACY_MIGRATIONS) {
    await resolveMigration(migration);
  }

  return {
    status: 'adopted',
    message: `Verified and baselined ${LEGACY_MIGRATIONS.length} legacy migrations.`,
  };
}

export function validateLegacySchema(snapshot) {
  const mismatches = [];

  for (const [table, columns] of Object.entries(requiredColumns)) {
    if (!snapshot.tables.has(table)) {
      mismatches.push(`missing table ${table}`);
      continue;
    }
    for (const column of columns) {
      if (!snapshot.columns.has(`${table}.${column}`)) {
        mismatches.push(`missing column ${table}.${column}`);
      }
    }
  }
  for (const index of requiredIndexes) {
    if (!snapshot.indexes.has(index)) mismatches.push(`missing index ${index}`);
  }
  for (const constraint of requiredConstraints) {
    if (!snapshot.constraints.has(constraint)) {
      mismatches.push(`missing constraint ${constraint}`);
    }
  }
  for (const extension of requiredExtensions) {
    if (!snapshot.extensions.has(extension)) mismatches.push(`missing extension ${extension}`);
  }
  if (snapshot.columnNullability.get('users.password_hash') !== 'YES') {
    mismatches.push('users.password_hash is not nullable');
  }
  if (
    !/PRIMARY KEY \(id, embedding_profile\)/i.test(
      snapshot.constraints.get('knowledge_chunks_pkey') ?? '',
    )
  ) {
    mismatches.push('knowledge_chunks_pkey is not the expected composite key');
  }

  return mismatches;
}

async function inspectSchema(client) {
  const [tablesResult, columnsResult, indexesResult, constraintsResult, extensionsResult] =
    await Promise.all([
      client.query(`
        select table_name
        from information_schema.tables
        where table_schema = current_schema() and table_type = 'BASE TABLE'
      `),
      client.query(`
        select table_name, column_name, is_nullable
        from information_schema.columns
        where table_schema = current_schema()
      `),
      client.query(`
        select indexname
        from pg_indexes
        where schemaname = current_schema()
      `),
      client.query(`
        select constraint_name,
               pg_get_constraintdef(pg_constraint.oid) as definition
        from information_schema.table_constraints
        join pg_constraint on pg_constraint.conname = constraint_name
        join pg_namespace on pg_namespace.oid = pg_constraint.connamespace
        where constraint_schema = current_schema()
          and pg_namespace.nspname = current_schema()
      `),
      client.query('select extname from pg_extension'),
    ]);

  return {
    tables: new Set(tablesResult.rows.map((row) => row.table_name)),
    columns: new Set(columnsResult.rows.map((row) => `${row.table_name}.${row.column_name}`)),
    columnNullability: new Map(
      columnsResult.rows.map((row) => [`${row.table_name}.${row.column_name}`, row.is_nullable]),
    ),
    indexes: new Set(indexesResult.rows.map((row) => row.indexname)),
    constraints: new Map(
      constraintsResult.rows.map((row) => [row.constraint_name, row.definition]),
    ),
    extensions: new Set(extensionsResult.rows.map((row) => row.extname)),
  };
}
