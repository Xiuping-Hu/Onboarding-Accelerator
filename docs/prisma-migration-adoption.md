# Prisma Migration Adoption

`prisma/migrations` is the only active schema-change history. The SQL in `db/migrations` is retained
as a read-only historical archive and must not receive new migrations.

## New Database

Set an explicit `DATABASE_URL`, then apply and verify the schema:

```powershell
npm run db:migrate:deploy
npm run db:migrate:status
```

Never use the placeholder generation URL from `prisma.config.ts` for migration or integration
commands.

## Existing Database Baseline

Use this procedure only when all seven historical SQL migrations were already applied by the old
workflow.

1. Take and verify a database backup.
2. Compare the applied schema with the seven files in `prisma/migrations`. Resolve any drift before
   baselining.
3. Set `DATABASE_URL` to the target database.
4. Record the existing history without executing its SQL:

```powershell
npx prisma migrate resolve --applied 0001_postgres_pgvector
npx prisma migrate resolve --applied 0002_users_table
npx prisma migrate resolve --applied 0003_postgres_account_auth
npx prisma migrate resolve --applied 0004_rag_source_snapshots
npx prisma migrate resolve --applied 0005_knowledge_embedding_profiles
npx prisma migrate resolve --applied 0006_rag_grounded_knowledge_maps
npx prisma migrate resolve --applied 0007_microsoft_entra_auth
npm run db:migrate:status
```

5. Confirm that status reports the database schema as up to date before application deployment.

Do not baseline an empty or partially migrated database. Use `db:migrate:deploy` for an empty
database, and repair a partial database from its backup and migration records before continuing.

## Ongoing Changes

Create development migrations with `npm run db:migrate:dev`, review the generated SQL, and commit
the new Prisma migration directory. Deployments run `db:migrate:status` followed by
`db:migrate:deploy` before the compatible application release.

After setting `TEST_DATABASE_URL` to a disposable migrated PostgreSQL database, run `npm test` to
include the Prisma rollback, JSON, revision, and pgvector integration check.
