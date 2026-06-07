# Onboarding Accelerator

Skeleton for a Microsoft Teams onboarding assistant. The Teams plugin calls a server-side agent endpoint, and the server has a placeholder retrieval layer for knowledge-base backed answers.

## Workspaces

- `apps/server`: Express API with agent and RAG boundaries.
- `apps/teams-plugin`: Vite/React Teams frontend shell.
- `packages/shared`: Shared request and response contracts.
- `docs/harness`: Lightweight generated docs that map the current code structure.

## Local Commands

```powershell
npm install
npm run dev
npm run lint
npm run format:check
npm run docs:harness:update
```

The pre-commit hook updates harness docs, stages the generated docs, then runs lint and Prettier checks.
