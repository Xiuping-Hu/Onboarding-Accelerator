# Specs Archive

Specification markdown is kept in `specs/archive` with stable numeric prefixes so completed,
superseded, and future-planning documents can be referenced without competing with current docs.

| Number | Spec                                               | Status     | Notes                                                                    |
| ------ | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 001    | `archive/001-next-stack-migration.md`              | Complete   | Historical migration plan for the current Next.js App Router stack.      |
| 002    | `archive/002-postgres-pgvector-original.md`        | Superseded | Broader database-first plan; kept for context only.                      |
| 003    | `archive/003-postgres-pgvector.md`                 | Complete   | Implemented optional Postgres sessions and pgvector retrieval path.      |
| 004    | `archive/004-account-login-system.md`              | Superseded | Original password/cookie proposal; implemented by spec 005.              |
| 005    | `archive/005-postgres-account-system.md`           | Complete   | Implemented Postgres users, auth sessions, login audit, and cookies.     |
| 006    | `archive/006-internal-ops-logging-no-ai-fees.md`   | Proposed   | Internal ops logging site with no client-visible AI fees or logs.        |
| 007    | `archive/007-limited-zoomable-client-canvas.md`    | Proposed   | Bounded client canvas with auto-fit, pan, zoom, and collapsible panels.  |
| 008    | `archive/008-assistant-ui-agent-drawer.md`         | Proposed   | assistant-ui migration for the right agent assistant drawer.             |
| 009    | `archive/009-admin-ops-activity-ai-fee.md`         | Complete   | Admin-only managed website for activity logs and AI fee operations.      |
| 010    | `archive/010-full-screen-canvas-assistant-chat.md` | Complete   | Full-screen canvas with chat-only assistant-ui right drawer.             |
| 011    | `archive/011-dynamic-agent-created-guide-map.md`   | Complete   | Empty-first guide maps created from agent domain knowledge.              |
| 012    | `archive/012-rag-ingestion-sop.md`                 | Proposed   | Production RAG ingestion SOP for files, media, websites, and SharePoint. |
| 013    | `archive/013-assistant-ui-workspace-panels.md`     | Proposed   | Unified assistant-ui plan navigation and production chat panels.         |

Current runtime documentation lives in `README.md`, `docs/production-readiness.md`, and the generated
harness docs under `docs/harness/generated`.
