import pg from 'pg';

const { Pool } = pg;

export type QueryParams = readonly unknown[];

export interface DatabaseClient {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: QueryParams,
  ): Promise<pg.QueryResult<T>>;
  transaction?<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

export async function withTransaction<T>(
  database: DatabaseClient,
  callback: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  return database.transaction ? database.transaction(callback) : callback(database);
}

let pool: pg.Pool | undefined;

export function getDatabasePool(connectionString: string): pg.Pool {
  pool ??= new Pool({
    connectionString,
    max: Number.parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const currentPool = pool;
  const transactionPool = currentPool as pg.Pool & DatabaseClient;
  transactionPool.transaction = async <T>(callback: (client: DatabaseClient) => Promise<T>) => {
    const client = await currentPool.connect();

    try {
      await client.query('begin');
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  return transactionPool;
}
