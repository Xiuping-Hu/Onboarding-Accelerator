# Harness Docs

This tree is for lightweight, code-adjacent documentation that helps future agents and contributors understand the repository quickly.

Generated files live in `docs/harness/generated` and are refreshed by:

```powershell
npm run docs:harness:update
```

The pre-commit hook runs the same command and stages generated docs before lint and format checks.
