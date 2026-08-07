ALTER TABLE "onboarding_journey_versions"
  ADD COLUMN "supersedes_version_id" UUID,
  ADD COLUMN "change_source" TEXT NOT NULL DEFAULT 'created',
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "source_references" JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE "onboarding_plans"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_reason" TEXT;

ALTER TABLE "onboarding_task_instances"
  ADD COLUMN "retired_at" TIMESTAMPTZ(6),
  ADD COLUMN "retired_reason" TEXT;

CREATE TABLE "onboarding_plan_revision_events" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "owner_id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "from_definition_version_id" UUID,
  "to_definition_version_id" UUID NOT NULL,
  "plan_revision" INTEGER NOT NULL,
  "command_type" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "impact" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_plan_revision_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_ai_proposals" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "owner_id" TEXT NOT NULL,
  "base_plan_revision" INTEGER NOT NULL,
  "base_content_hash" TEXT NOT NULL,
  "proposal_hash" TEXT NOT NULL,
  "operations" JSONB NOT NULL,
  "rationale" TEXT NOT NULL,
  "assumptions" JSONB NOT NULL,
  "warnings" JSONB NOT NULL,
  "source_references" JSONB NOT NULL,
  "impact" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMPTZ(6),
  CONSTRAINT "onboarding_ai_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_plan_revision_events_idempotency_key"
  ON "onboarding_plan_revision_events"("plan_id", "idempotency_key");
CREATE UNIQUE INDEX "onboarding_plan_revision_events_revision_key"
  ON "onboarding_plan_revision_events"("plan_id", "plan_revision");
CREATE INDEX "onboarding_plan_revision_events_owner_created_idx"
  ON "onboarding_plan_revision_events"("owner_id", "created_at" DESC);
CREATE INDEX "onboarding_ai_proposals_owner_expires_idx"
  ON "onboarding_ai_proposals"("owner_id", "expires_at");
CREATE INDEX "onboarding_ai_proposals_plan_status_idx"
  ON "onboarding_ai_proposals"("plan_id", "status");
CREATE INDEX "onboarding_journey_versions_supersedes_idx"
  ON "onboarding_journey_versions"("supersedes_version_id");

ALTER TABLE "onboarding_journey_versions"
  ADD CONSTRAINT "onboarding_journey_versions_supersedes_version_id_fkey"
  FOREIGN KEY ("supersedes_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "onboarding_plan_revision_events"
  ADD CONSTRAINT "onboarding_plan_revision_events_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "onboarding_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "onboarding_plan_revision_events"
  ADD CONSTRAINT "onboarding_plan_revision_events_from_definition_version_id_fkey"
  FOREIGN KEY ("from_definition_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "onboarding_plan_revision_events"
  ADD CONSTRAINT "onboarding_plan_revision_events_to_definition_version_id_fkey"
  FOREIGN KEY ("to_definition_version_id") REFERENCES "onboarding_journey_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "onboarding_ai_proposals"
  ADD CONSTRAINT "onboarding_ai_proposals_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "onboarding_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
