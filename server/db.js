import { randomUUID } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool, types } = pg;
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const MIGRATION_LOCK_ID = 207232026;

types.setTypeParser(20, value => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
});

let db;

function normalizeStatement(statement, values) {
  if (typeof statement === 'string') return { sql: statement, args: values || [] };
  return { sql: statement.sql, args: statement.args || [] };
}

export function toPostgresParameters(sql) {
  let output = '';
  let parameter = 0;
  let state = 'normal';
  let dollarTag = '';

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      output += char;
      if (char === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      output += char;
      if (char === '*' && next === '/') {
        output += next;
        index += 1;
        state = 'normal';
      }
      continue;
    }
    if (state === 'single-quote') {
      output += char;
      if (char === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (char === "'") state = 'normal';
      continue;
    }
    if (state === 'double-quote') {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (char === '"') state = 'normal';
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        output += dollarTag;
        index += dollarTag.length - 1;
        state = 'normal';
      } else output += char;
      continue;
    }

    if (char === '-' && next === '-') {
      output += `${char}${next}`;
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output += `${char}${next}`;
      index += 1;
      state = 'block-comment';
    } else if (char === "'") {
      output += char;
      state = 'single-quote';
    } else if (char === '"') {
      output += char;
      state = 'double-quote';
    } else if (char === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        output += dollarTag;
        index += dollarTag.length - 1;
        state = 'dollar-quote';
      } else output += char;
    } else if (char === '?') {
      parameter += 1;
      output += `$${parameter}`;
    } else output += char;
  }
  return output;
}

function wrapResult(result) {
  return {
    ...result,
    rows: result.rows || [],
    rowsAffected: result.rowCount ?? result.affectedRows ?? 0,
  };
}

async function runQuery(queryable, statement, values) {
  const { sql, args } = normalizeStatement(statement, values);
  const convertedSql = toPostgresParameters(sql);
  if (args.length === 0 && typeof queryable.exec === 'function' && /;\s*\S/.test(convertedSql)) {
    const results = await queryable.exec(convertedSql);
    return wrapResult(results.at(-1) || { rows: [], rowCount: 0 });
  }
  return wrapResult(await queryable.query(convertedSql, args));
}

function createAdapter(pool) {
  return {
    execute(statement, values) {
      return runQuery(pool, statement, values);
    },
    async batch(statements) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const statement of statements) results.push(await runQuery(client, statement));
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
    pool,
    async withMigrationLock(run) {
      const client = await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
        return await run();
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
        client.release();
      }
    },
  };
}

export function createPgliteAdapter(database) {
  return {
    execute(statement, values) {
      return runQuery(database, statement, values);
    },
    batch(statements) {
      return database.transaction(async transaction => {
        const results = [];
        for (const statement of statements) results.push(await runQuery(transaction, statement));
        return results;
      });
    },
    close() {
      return database.close();
    },
    database,
  };
}

export function setDbForTests(client) {
  db = client;
}

export function getDb() {
  if (db) return db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL est requis pour PostgreSQL');
  }
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 10000),
  });
  pool.on('error', error => console.error('[FresCoop] Connexion PostgreSQL inactive en erreur:', error.message));
  db = createAdapter(pool);
  return db;
}

export async function closeDb() {
  if (!db) return;
  const current = db;
  db = undefined;
  await current.close?.();
}

async function listMigrations() {
  const names = await readdir(migrationsDir);
  return names.filter(name => /^\d+.*\.sql$/.test(name)).sort((left, right) => {
    const numberDifference = Number.parseInt(left, 10) - Number.parseInt(right, 10);
    return numberDifference || left.localeCompare(right);
  });
}

async function applyMigrations(client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = await client.execute('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.rows.map(row => row.name));
  const migrations = await listMigrations();
  const executed = [];

  for (const name of migrations) {
    if (appliedNames.has(name)) continue;
    const sql = (await readFile(join(migrationsDir, name), 'utf8')).replace(/^﻿/, '');
    await client.batch([
      { sql },
      { sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [name] },
    ]);
    executed.push(name);
  }
  return executed;
}

export async function migrateDb(client = getDb()) {
  if (typeof client.withMigrationLock === 'function') {
    return client.withMigrationLock(() => applyMigrations(client));
  }
  return applyMigrations(client);
}

export async function initDb() {
  const client = getDb();
  await migrateDb(client);
  return client;
}

export function uuid() {
  return randomUUID();
}
