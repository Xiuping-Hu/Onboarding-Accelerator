CREATE TABLE "onboarding_journey_versions" (
    "id" UUID NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stages" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_journey_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_plans" (
    "id" UUID NOT NULL,
    "session_id" UUID,
    "owner_id" TEXT NOT NULL,
    "definition_version_id" UUID NOT NULL,
    "activation_request_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "target_at" TIMESTAMPTZ(6),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "onboarding_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_task_instances" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "stable_key" TEXT NOT NULL,
    "stage_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "onboarding_task_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_task_events" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "task_revision" INTEGER NOT NULL,
    "plan_revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_task_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_journey_versions_owner_created_idx"
ON "onboarding_journey_versions"("owner_id", "created_at" DESC);

CREATE UNIQUE INDEX "onboarding_plans_activation_request_key"
ON "onboarding_plans"("owner_id", "activation_request_id");

CREATE UNIQUE INDEX "onboarding_plans_one_active_per_owner"
ON "onboarding_plans"("owner_id") WHERE "status" = 'active';

CREATE INDEX "onboarding_plans_owner_status_idx"
ON "onboarding_plans"("owner_id", "status");

CREATE UNIQUE INDEX "onboarding_task_instances_definition_key"
ON "onboarding_task_instances"("plan_id", "definition_id");

CREATE INDEX "onboarding_task_instances_plan_stage_idx"
ON "onboarding_task_instances"("plan_id", "stage_id");

CREATE UNIQUE INDEX "onboarding_task_events_idempotency_key"
ON "onboarding_task_events"("plan_id", "idempotency_key");

CREATE INDEX "onboarding_task_events_task_created_idx"
ON "onboarding_task_events"("task_id", "created_at");

ALTER TABLE "onboarding_plans"
ADD CONSTRAINT "onboarding_plans_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "onboarding_sessions"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "onboarding_plans"
ADD CONSTRAINT "onboarding_plans_definition_version_id_fkey"
FOREIGN KEY ("definition_version_id") REFERENCES "onboarding_journey_versions"("id")
ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "onboarding_task_instances"
ADD CONSTRAINT "onboarding_task_instances_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "onboarding_plans"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "onboarding_task_events"
ADD CONSTRAINT "onboarding_task_events_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "onboarding_plans"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "onboarding_task_events"
ADD CONSTRAINT "onboarding_task_events_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "onboarding_task_instances"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
