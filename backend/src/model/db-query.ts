import { Pool } from 'pg';
import format from 'pg-format';
import env from '../lib/env';

const logQuery = function (statement: string): void {
  const timeStamp: Date = new Date();
  const formattedTimeStamp: string = timeStamp.toString().substring(4, 24);
  console.log(formattedTimeStamp, statement);
};

// a shared pool reuses TLS connections between queries; opening a fresh
// connection per query costs ~1s against a remote database like Neon
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 5,
  // release idle connections before the server side drops them, so the pool
  // never hands out a stale socket
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// an idle connection erroring (e.g. dropped by the server) must not crash
// the process
pool.on('error', (error) => {
  console.error('Unexpected error on idle database connection:', error);
});

export default async function (
  statement: string,
  ...parameters: Array<unknown>
) {
  const sql = format(statement, ...parameters);

  try {
    if (env.DEBUG) logQuery(sql);
    const result = await pool.query(sql);
    return result;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
}
