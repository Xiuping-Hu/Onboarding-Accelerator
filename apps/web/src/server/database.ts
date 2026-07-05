import pg from 'pg';

const { Pool } = pg;

export type QueryParams = readonly unknown[];

export interface DatabaseClient {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: QueryParams,
  ): Promise<pg.QueryResult<T>>;
}

let pool: pg.Pool | undefined;

export function getDatabasePool(connectionString: string): pg.Pool {
  pool ??= new Pool({
    connectionString,
    max: Number.parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
}
