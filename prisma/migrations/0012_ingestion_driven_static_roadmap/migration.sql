-- Add the ingestion-driven canonical roadmap alongside all legacy onboarding records.
-- Existing owner-scoped versions/plans remain readable and are never rewritten by this migration.

-- Source versions and their physical embedding rows become immutable snapshot identities. Normal
-- unchanged detection still avoids redundant versions; retries after a rejected candidate allocate
-- a new version instead of reopening old evidence. Prefix existing physical chunk IDs so future
-- versions can retain the same logical chunk key without moving or overwriting prior embeddings.
ALTER TABLE "knowledge_source_versions"
  DROP CONSTRAINT IF EXISTS "knowledge_source_versions_source_id_content_hash_key";
CREATE INDEX IF NOT EXISTS "knowledge_source_versions_source_content_idx"
  ON "knowledge_source_versions"("source_id", "content_hash");
UPDATE "knowledge_chunks"
SET "id" = "source_version_id" || ':' || "id"
WHERE "source_version_id" IS NOT NULL
  AND "id" NOT LIKE "source_version_id" || ':%';

ALTER TABLE "onboarding_journey_versions"
  ALTER COLUMN "owner_id" DROP NOT NULL,
  ADD COLUMN "roadmap_id" UUID,
  ADD COLUMN "version_number" INTEGER,
  ADD COLUMN "lifecycle_status" TEXT,
  ADD COLUMN "content_hash" TEXT,
  ADD COLUMN "knowledge_snapshot_hash" TEXT,
  ADD COLUMN "artifact_key" TEXT,
  ADD COLUMN "evidence_hash" TEXT,
  ADD COLUMN "source_version_id" TEXT,
  ADD COLUMN "input_descriptor" JSONB,
  ADD COLUMN "provenance" JSONB,
  ADD COLUMN "objective_version" TEXT,
  ADD COLUMN "retrieval_config_version" TEXT,
  ADD COLUMN "retrieval_query_set_version" TEXT,
  ADD COLUMN "generator_schema_version" TEXT,
  ADD COLUMN "prompt_version" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "decoding_config_version" TEXT,
  ADD COLUMN "generation_job_id" UUID,
  ADD COLUMN "published_at" TIMESTAMPTZ(6);

ALTER TABLE "onboarding_plans"
  ADD COLUMN "roadmap_id" UUID,
  ADD COLUMN "canonical_owner_id" UUID,
  ADD COLUMN "applied_version_id" UUID,
  ADD COLUMN "desired_version_id" UUID,
  ADD COLUMN "state_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sync_status" TEXT,
  ADD COLUMN "first_applied_at" TIMESTAMPTZ(6),
  ADD COLUMN "synced_at" TIMESTAMPTZ(6),
  ADD COLUMN "sync_error" TEXT;

ALTER TABLE "onboarding_task_instances"
  ADD COLUMN "canonical_item_id" UUID,
  ADD COLUMN "applied_version_id" UUID,
  ADD COLUMN "semantics_hash" TEXT,
  ADD COLUMN "semantics_hash_version" TEXT,
  ADD COLUMN "introduced_version_id" UUID,
  ADD COLUMN "last_applied_version_id" UUID,
  ADD COLUMN "retired_version_id" UUID;

ALTER TABLE "onboarding_task_events"
  ADD COLUMN "request_hash" TEXT,
  ADD COLUMN "response" JSONB;

DROP INDEX IF EXISTS "onboarding_task_instances_definition_key";
CREATE INDEX "onboarding_task_instances_definition_idx"
  ON "onboarding_task_instances"("plan_id", "definition_id");

CREATE TABLE "onboarding_roadmaps" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "current_version_id" UUID,
  "current_derivation_id" UUID,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "latest_refresh_sequence" BIGINT NOT NULL DEFAULT 0,
  "last_published_refresh_sequence" BIGINT NOT NULL DEFAULT 0,
  "current_knowledge_snapshot_hash" TEXT,
  "suspended_at" TIMESTAMPTZ(6),
  "suspension_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmaps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmaps_revision_nonnegative" CHECK ("revision" >= 0),
  CONSTRAINT "onboarding_roadmaps_sequence_order" CHECK (
    "latest_refresh_sequence" >= "last_published_refresh_sequence"
  )
);

CREATE UNIQUE INDEX "onboarding_roadmaps_key_key" ON "onboarding_roadmaps"("key");

CREATE TABLE "onboarding_roadmap_refresh_jobs" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "publication_event_id" TEXT NOT NULL,
  "operator_request_id" TEXT,
  "refresh_sequence" BIGINT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_version_id" TEXT NOT NULL,
  "source_manifest_hash" TEXT NOT NULL,
  "access_scope" TEXT NOT NULL,
  "embedding_profile_id" TEXT NOT NULL,
  "retrieval_config_version" TEXT NOT NULL,
  "retrieval_query_set_version" TEXT NOT NULL,
  "objective_version" TEXT NOT NULL,
  "generator_schema_version" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "decoding_config_version" TEXT NOT NULL,
  "lineage_base_version_id" UUID,
  "lineage_base_content_hash" TEXT,
  "knowledge_snapshot_hash" TEXT NOT NULL,
  "artifact_key" TEXT NOT NULL,
  "input_descriptor" JSONB NOT NULL,
  "evidence_bundle" JSONB,
  "evidence_bundle_hash" TEXT,
  "generated_artifact" JSONB,
  "generated_content_hash" TEXT,
  "generated_evidence_hash" TEXT,
  "provider_usage" JSONB,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_by" TEXT,
  "claim_token" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(6),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "error_code" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_refresh_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmap_refresh_jobs_scope_check" CHECK ("access_scope" = 'all_users'),
  CONSTRAINT "onboarding_roadmap_refresh_jobs_status_check" CHECK (
    "status" IN ('queued', 'running', 'retryable', 'published', 'equivalent', 'stale', 'failed', 'cancelled')
  ),
  CONSTRAINT "onboarding_roadmap_refresh_jobs_attempt_check" CHECK ("attempt" >= 0),
  CONSTRAINT "onboarding_roadmap_refresh_jobs_claim_check" CHECK ("claim_token" >= 0)
);

CREATE UNIQUE INDEX "onboarding_roadmap_refresh_jobs_publication_key"
  ON "onboarding_roadmap_refresh_jobs"("roadmap_id", "publication_event_id");
CREATE UNIQUE INDEX "onboarding_roadmap_refresh_jobs_sequence_key"
  ON "onboarding_roadmap_refresh_jobs"("roadmap_id", "refresh_sequence");
CREATE UNIQUE INDEX "onboarding_roadmap_refresh_jobs_operator_request_key"
  ON "onboarding_roadmap_refresh_jobs"("roadmap_id", "operator_request_id")
  WHERE "operator_request_id" IS NOT NULL;
CREATE INDEX "onboarding_roadmap_refresh_jobs_claim_idx"
  ON "onboarding_roadmap_refresh_jobs"("status", "available_at", "refresh_sequence");
CREATE INDEX "onboarding_roadmap_refresh_jobs_artifact_idx"
  ON "onboarding_roadmap_refresh_jobs"("roadmap_id", "artifact_key", "evidence_bundle_hash");
CREATE INDEX "onboarding_roadmap_refresh_jobs_source_version_idx"
  ON "onboarding_roadmap_refresh_jobs"("source_version_id");

CREATE TABLE "onboarding_roadmap_derivations" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "content_version_id" UUID NOT NULL,
  "refresh_job_id" UUID NOT NULL,
  "source_version_id" TEXT NOT NULL,
  "knowledge_snapshot_hash" TEXT NOT NULL,
  "artifact_key" TEXT NOT NULL,
  "evidence_hash" TEXT NOT NULL,
  "input_descriptor" JSONB NOT NULL,
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_derivations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_roadmap_derivations_refresh_job_key"
  ON "onboarding_roadmap_derivations"("refresh_job_id");
CREATE UNIQUE INDEX "onboarding_roadmap_derivations_snapshot_content_key"
  ON "onboarding_roadmap_derivations"("roadmap_id", "knowledge_snapshot_hash", "content_version_id");
CREATE INDEX "onboarding_roadmap_derivations_source_version_idx"
  ON "onboarding_roadmap_derivations"("source_version_id");

CREATE TABLE "onboarding_roadmap_publication_events" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "refresh_job_id" UUID NOT NULL,
  "prior_version_id" UUID,
  "content_version_id" UUID NOT NULL,
  "derivation_id" UUID,
  "event_type" TEXT NOT NULL,
  "refresh_sequence" BIGINT NOT NULL,
  "root_revision" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_publication_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_roadmap_publication_events_refresh_job_key"
  ON "onboarding_roadmap_publication_events"("refresh_job_id");
CREATE INDEX "onboarding_roadmap_publication_events_roadmap_created_idx"
  ON "onboarding_roadmap_publication_events"("roadmap_id", "created_at" DESC);

CREATE TABLE "onboarding_roadmap_rollouts" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "canonical_version_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "initial_bootstrap" BOOLEAN NOT NULL DEFAULT false,
  "cohort_captured_at" TIMESTAMPTZ(6) NOT NULL,
  "target_count" INTEGER NOT NULL DEFAULT 0,
  "applied_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "cursor_user_id" UUID,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "superseded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_rollouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmap_rollouts_status_check" CHECK (
    "status" IN ('pending', 'running', 'partial', 'complete', 'superseded', 'failed')
  ),
  CONSTRAINT "onboarding_roadmap_rollouts_counts_check" CHECK (
    "target_count" >= 0 AND "applied_count" >= 0 AND "failed_count" >= 0
  )
);

CREATE UNIQUE INDEX "onboarding_roadmap_rollouts_version_key"
  ON "onboarding_roadmap_rollouts"("canonical_version_id");
CREATE INDEX "onboarding_roadmap_rollouts_status_idx"
  ON "onboarding_roadmap_rollouts"("roadmap_id", "status", "created_at");

CREATE TABLE "onboarding_roadmap_user_syncs" (
  "id" UUID NOT NULL,
  "rollout_id" UUID,
  "roadmap_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "user_state_id" UUID,
  "target_version_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "initial_account" BOOLEAN NOT NULL DEFAULT false,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_by" TEXT,
  "claim_token" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(6),
  "retained_count" INTEGER NOT NULL DEFAULT 0,
  "added_count" INTEGER NOT NULL DEFAULT 0,
  "retired_count" INTEGER NOT NULL DEFAULT 0,
  "due_date_changed_count" INTEGER NOT NULL DEFAULT 0,
  "completed_preserved_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_user_syncs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmap_user_syncs_status_check" CHECK (
    "status" IN ('pending', 'running', 'retryable', 'applied', 'failed', 'superseded')
  ),
  CONSTRAINT "onboarding_roadmap_user_syncs_initial_account_check" CHECK (
    ("rollout_id" IS NULL) = "initial_account"
  )
);

CREATE UNIQUE INDEX "onboarding_roadmap_user_syncs_rollout_user_key"
  ON "onboarding_roadmap_user_syncs"("rollout_id", "user_id");
CREATE UNIQUE INDEX "onboarding_roadmap_user_syncs_user_target_key"
  ON "onboarding_roadmap_user_syncs"("user_id", "target_version_id");
CREATE INDEX "onboarding_roadmap_user_syncs_claim_idx"
  ON "onboarding_roadmap_user_syncs"("status", "available_at", "created_at");
CREATE INDEX "onboarding_roadmap_user_syncs_state_target_idx"
  ON "onboarding_roadmap_user_syncs"("user_state_id", "target_version_id");

CREATE TABLE "onboarding_roadmap_update_notices" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "canonical_version_id" UUID NOT NULL,
  "rollout_id" UUID NOT NULL,
  "retained_count" INTEGER NOT NULL DEFAULT 0,
  "added_count" INTEGER NOT NULL DEFAULT 0,
  "retired_count" INTEGER NOT NULL DEFAULT 0,
  "completed_preserved_count" INTEGER NOT NULL DEFAULT 0,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_update_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_roadmap_update_notices_user_version_key"
  ON "onboarding_roadmap_update_notices"("user_id", "canonical_version_id");
CREATE INDEX "onboarding_roadmap_update_notices_unread_idx"
  ON "onboarding_roadmap_update_notices"("user_id", "read_at", "created_at" DESC);

CREATE TABLE "onboarding_roadmap_reconciliation_events" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "user_state_id" UUID NOT NULL,
  "user_sync_id" UUID NOT NULL,
  "target_version_id" UUID NOT NULL,
  "task_instance_id" UUID,
  "stable_key" TEXT,
  "event_type" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "state_revision" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_roadmap_reconciliation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmap_reconciliation_events_type_check" CHECK (
    "event_type" IN ('item_added', 'item_retained', 'item_retired', 'item_due_date_changed', 'version_applied')
  )
);

CREATE INDEX "onboarding_roadmap_reconciliation_events_state_created_idx"
  ON "onboarding_roadmap_reconciliation_events"("user_state_id", "created_at");
CREATE INDEX "onboarding_roadmap_reconciliation_events_sync_idx"
  ON "onboarding_roadmap_reconciliation_events"("user_sync_id");

CREATE TABLE "onboarding_roadmap_evidence_pins" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "source_version_id" TEXT NOT NULL,
  "refresh_job_id" UUID,
  "canonical_version_id" UUID,
  "derivation_id" UUID,
  "evidence_bundle_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ(6),
  CONSTRAINT "onboarding_roadmap_evidence_pins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmap_evidence_pins_owner_check" CHECK (
    num_nonnulls("refresh_job_id", "canonical_version_id", "derivation_id") = 1
  )
);

CREATE INDEX "onboarding_roadmap_evidence_pins_source_idx"
  ON "onboarding_roadmap_evidence_pins"("source_version_id", "released_at");
CREATE INDEX "onboarding_roadmap_evidence_pins_job_idx"
  ON "onboarding_roadmap_evidence_pins"("refresh_job_id");

CREATE TABLE "onboarding_roadmap_governance_events" (
  "id" UUID NOT NULL,
  "roadmap_id" UUID NOT NULL,
  "source_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "decision_status" TEXT NOT NULL DEFAULT 'pending',
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  "resolved_by" TEXT,
  CONSTRAINT "onboarding_roadmap_governance_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_roadmap_governance_events_status_check" CHECK (
    "decision_status" IN ('pending', 'approved', 'dismissed')
  )
);

CREATE INDEX "onboarding_roadmap_governance_events_status_idx"
  ON "onboarding_roadmap_governance_events"("roadmap_id", "decision_status", "created_at");

-- Canonical-versus-legacy version shape. Content/provenance columns are immutable by application
-- policy; this constraint prevents owner-scoped and global authority from being mixed.
ALTER TABLE "onboarding_journey_versions"
  ADD CONSTRAINT "onboarding_journey_versions_authority_shape" CHECK (
    ("roadmap_id" IS NULL AND "owner_id" IS NOT NULL AND "version_number" IS NULL)
    OR
    ("roadmap_id" IS NOT NULL AND "owner_id" IS NULL AND "version_number" IS NOT NULL
      AND "content_hash" IS NOT NULL AND "knowledge_snapshot_hash" IS NOT NULL
      AND "generation_job_id" IS NOT NULL AND "published_at" IS NOT NULL)
  );

CREATE UNIQUE INDEX "onboarding_journey_versions_roadmap_version_key"
  ON "onboarding_journey_versions"("roadmap_id", "version_number")
  WHERE "roadmap_id" IS NOT NULL;
CREATE UNIQUE INDEX "onboarding_journey_versions_generation_job_key"
  ON "onboarding_journey_versions"("generation_job_id")
  WHERE "generation_job_id" IS NOT NULL;
CREATE INDEX "onboarding_journey_versions_artifact_idx"
  ON "onboarding_journey_versions"("roadmap_id", "artifact_key");
CREATE INDEX "onboarding_journey_versions_source_version_idx"
  ON "onboarding_journey_versions"("source_version_id");

CREATE UNIQUE INDEX "onboarding_plans_canonical_owner_roadmap_key"
  ON "onboarding_plans"("canonical_owner_id", "roadmap_id")
  WHERE "roadmap_id" IS NOT NULL;
CREATE INDEX "onboarding_plans_canonical_owner_roadmap_idx"
  ON "onboarding_plans"("canonical_owner_id", "roadmap_id");
CREATE INDEX "onboarding_plans_roadmap_sync_idx"
  ON "onboarding_plans"("roadmap_id", "desired_version_id", "sync_status");
ALTER TABLE "onboarding_plans"
  ADD CONSTRAINT "onboarding_plans_canonical_shape" CHECK (
    "roadmap_id" IS NULL OR (
      "canonical_owner_id" IS NOT NULL AND "applied_version_id" IS NOT NULL
      AND "desired_version_id" IS NOT NULL
      AND "sync_status" IN ('current', 'pending', 'failed')
    )
  );

CREATE UNIQUE INDEX "onboarding_task_instances_current_canonical_stable_key"
  ON "onboarding_task_instances"("plan_id", "stable_key")
  WHERE "retired_at" IS NULL AND "canonical_item_id" IS NOT NULL;
CREATE INDEX "onboarding_task_instances_current_stable_idx"
  ON "onboarding_task_instances"("plan_id", "stable_key", "retired_at");
CREATE INDEX "onboarding_task_instances_canonical_item_idx"
  ON "onboarding_task_instances"("canonical_item_id");

ALTER TABLE "onboarding_roadmap_refresh_jobs"
  ADD CONSTRAINT "onboarding_roadmap_refresh_jobs_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_refresh_jobs_source_fk"
    FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_refresh_jobs_source_version_fk"
    FOREIGN KEY ("source_version_id") REFERENCES "knowledge_source_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_refresh_jobs_lineage_base_fk"
    FOREIGN KEY ("lineage_base_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_journey_versions"
  ADD CONSTRAINT "onboarding_journey_versions_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_journey_versions_source_version_fk"
    FOREIGN KEY ("source_version_id") REFERENCES "knowledge_source_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_journey_versions_generation_job_fk"
    FOREIGN KEY ("generation_job_id") REFERENCES "onboarding_roadmap_refresh_jobs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_derivations"
  ADD CONSTRAINT "onboarding_roadmap_derivations_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_derivations_content_version_fk"
    FOREIGN KEY ("content_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_derivations_refresh_job_fk"
    FOREIGN KEY ("refresh_job_id") REFERENCES "onboarding_roadmap_refresh_jobs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_derivations_source_version_fk"
    FOREIGN KEY ("source_version_id") REFERENCES "knowledge_source_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmaps"
  ADD CONSTRAINT "onboarding_roadmaps_current_version_fk"
    FOREIGN KEY ("current_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmaps_current_derivation_fk"
    FOREIGN KEY ("current_derivation_id") REFERENCES "onboarding_roadmap_derivations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_plans"
  ADD CONSTRAINT "onboarding_plans_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_plans_canonical_owner_fk"
    FOREIGN KEY ("canonical_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_plans_applied_version_fk"
    FOREIGN KEY ("applied_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_plans_desired_version_fk"
    FOREIGN KEY ("desired_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_task_instances"
  ADD CONSTRAINT "onboarding_task_instances_applied_version_fk"
    FOREIGN KEY ("applied_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_task_instances_introduced_version_fk"
    FOREIGN KEY ("introduced_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_task_instances_last_applied_version_fk"
    FOREIGN KEY ("last_applied_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_task_instances_retired_version_fk"
    FOREIGN KEY ("retired_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_publication_events"
  ADD CONSTRAINT "onboarding_roadmap_publication_events_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_publication_events_job_fk"
    FOREIGN KEY ("refresh_job_id") REFERENCES "onboarding_roadmap_refresh_jobs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_publication_events_prior_version_fk"
    FOREIGN KEY ("prior_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_publication_events_content_version_fk"
    FOREIGN KEY ("content_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_publication_events_derivation_fk"
    FOREIGN KEY ("derivation_id") REFERENCES "onboarding_roadmap_derivations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_rollouts"
  ADD CONSTRAINT "onboarding_roadmap_rollouts_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_rollouts_version_fk"
    FOREIGN KEY ("canonical_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_rollouts_cursor_user_fk"
    FOREIGN KEY ("cursor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_user_syncs"
  ADD CONSTRAINT "onboarding_roadmap_user_syncs_rollout_fk"
    FOREIGN KEY ("rollout_id") REFERENCES "onboarding_roadmap_rollouts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_user_syncs_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_user_syncs_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_user_syncs_state_fk"
    FOREIGN KEY ("user_state_id") REFERENCES "onboarding_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_user_syncs_target_version_fk"
    FOREIGN KEY ("target_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_update_notices"
  ADD CONSTRAINT "onboarding_roadmap_update_notices_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_update_notices_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_update_notices_version_fk"
    FOREIGN KEY ("canonical_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_update_notices_rollout_fk"
    FOREIGN KEY ("rollout_id") REFERENCES "onboarding_roadmap_rollouts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_reconciliation_events"
  ADD CONSTRAINT "onboarding_roadmap_reconciliation_events_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_reconciliation_events_state_fk"
    FOREIGN KEY ("user_state_id") REFERENCES "onboarding_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_reconciliation_events_sync_fk"
    FOREIGN KEY ("user_sync_id") REFERENCES "onboarding_roadmap_user_syncs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_reconciliation_events_target_version_fk"
    FOREIGN KEY ("target_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_reconciliation_events_task_fk"
    FOREIGN KEY ("task_instance_id") REFERENCES "onboarding_task_instances"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_evidence_pins"
  ADD CONSTRAINT "onboarding_roadmap_evidence_pins_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_evidence_pins_source_version_fk"
    FOREIGN KEY ("source_version_id") REFERENCES "knowledge_source_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_evidence_pins_job_fk"
    FOREIGN KEY ("refresh_job_id") REFERENCES "onboarding_roadmap_refresh_jobs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_evidence_pins_version_fk"
    FOREIGN KEY ("canonical_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_evidence_pins_derivation_fk"
    FOREIGN KEY ("derivation_id") REFERENCES "onboarding_roadmap_derivations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_roadmap_governance_events"
  ADD CONSTRAINT "onboarding_roadmap_governance_events_roadmap_fk"
    FOREIGN KEY ("roadmap_id") REFERENCES "onboarding_roadmaps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "onboarding_roadmap_governance_events_source_fk"
    FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
