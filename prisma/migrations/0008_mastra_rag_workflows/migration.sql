CREATE TABLE "rag_workflow_runs" (
    "id" UUID NOT NULL,
    "workflow_version" TEXT NOT NULL,
    "session_id" UUID NOT NULL,
    "owner_id" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_partition" TEXT NOT NULL,
    "plan_revision" INTEGER NOT NULL DEFAULT 0,
    "request_input" JSONB NOT NULL,
    "refinement" JSONB,
    "plan" JSONB,
    "result" JSONB,
    "last_failure" JSONB,
    "safe_error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "rag_workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rag_workflow_audit_events" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "partition" TEXT,
    "step_id" TEXT,
    "phase_id" TEXT,
    "plan_revision" INTEGER,
    "event_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason_code" TEXT,
    "evidence_refs" JSONB NOT NULL DEFAULT '[]',
    "input_hash" TEXT,
    "output_hash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "rag_workflow_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rag_workflow_runs_request_key"
ON "rag_workflow_runs"("owner_id", "session_id", "client_request_id");

CREATE INDEX "rag_workflow_runs_owner_session_idx"
ON "rag_workflow_runs"("owner_id", "session_id", "updated_at" DESC);

CREATE INDEX "rag_workflow_audit_events_run_event_idx"
ON "rag_workflow_audit_events"("run_id", "event_at");

ALTER TABLE "rag_workflow_audit_events"
ADD CONSTRAINT "rag_workflow_audit_events_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "rag_workflow_runs"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
