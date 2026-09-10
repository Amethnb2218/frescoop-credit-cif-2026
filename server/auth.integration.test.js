import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { app } from './index.js';
import { assertAuthConfiguration, hashPassword } from './auth.js';
import { getDb, createPgliteAdapter, migrateDb } from './db.js';
import { usePgliteTestDb } from './testDb.js';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  TOKEN_SECRET: process.env.TOKEN_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
};
const testPassword = 'auth-test-password';
const testUser = {
  id: 'auth-test-user',
  tenant_id: 'auth-test-tenant',
  email: 'admin-auth-test@example.invalid',
  name: 'Administrateur Test',
  role: 'ADMIN',
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function withServer(run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function login(baseUrl, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser.email, password }),
  });
  return { response, body: await response.json() };
}

let db;
test.before(async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.TOKEN_SECRET;
  db = await usePgliteTestDb();
  await db.execute({
    sql: 'INSERT INTO tenants (id, name, code) VALUES (?, ?, ?)',
    args: [testUser.tenant_id, 'Tenant Auth Test', 'AUTH-TEST'],
  });
  await db.execute({
    sql: `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      testUser.id,
      testUser.tenant_id,
      testUser.email,
      hashPassword(testPassword),
      testUser.name,
      testUser.role,
    ],
  });
});

test.after(async () => {
  restoreEnv();
  await db.close();
});

test('sécurise le parcours de connexion en production', async () => {
  assert.throws(() => assertAuthConfiguration(), /TOKEN_SECRET est requis en production/);

  await withServer(async baseUrl => {
    const invalid = await login(baseUrl, 'incorrect-password');
    assert.equal(invalid.response.status, 401);
    assert.deepEqual(invalid.body, { error: 'Identifiants incorrects' });

    const errors = [];
    const originalConsoleError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      const missingSecret = await login(baseUrl, testPassword);
      assert.equal(missingSecret.response.status, 500);
      assert.deepEqual(missingSecret.body, { error: 'Erreur serveur' });
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], '[FresCoop] auth.login failed');
    assert.equal(errors[0][1].stage, 'token_generation');
    assert.match(errors[0][1].message, /TOKEN_SECRET est requis en production/);

    process.env.TOKEN_SECRET = 'frescoop-auth-integration-test-secret-2026';
    assert.doesNotThrow(() => assertAuthConfiguration());

    const valid = await login(baseUrl, testPassword);
    assert.equal(valid.response.status, 200);
    assert.equal(valid.body.ok, true);
    assert.equal(valid.body.user.id, testUser.id);
    assert.equal(typeof valid.body.token, 'string');

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${valid.body.token}` },
    });
    const meBody = await meResponse.json();
    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.email, testUser.email);
  });

  const audit = await getDb().execute({
    sql: `SELECT user_name, user_role, action, details, ip_address
          FROM audit_log WHERE tenant_id = ? AND user_id = ?`,
    args: [testUser.tenant_id, testUser.id],
  });
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].action, 'LOGIN');
  assert.equal(audit.rows[0].user_name, testUser.name);
  assert.equal(audit.rows[0].user_role, testUser.role);
  assert.deepEqual(JSON.parse(audit.rows[0].details), {});
  assert.equal(typeof audit.rows[0].ip_address, 'string');
});

test('applique les migrations PostgreSQL de façon idempotente', async () => {
  const database = new PGlite();
  const isolatedDb = createPgliteAdapter(database);
  try {
    const firstMigration = await migrateDb(isolatedDb);
    assert.deepEqual(firstMigration, ['001_initial_schema.sql']);
    const secondMigration = await migrateDb(isolatedDb);
    assert.deepEqual(secondMigration, []);

    const columns = await isolatedDb.execute({
      sql: `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?`,
      args: ['audit_log'],
    });
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const column of ['user_name', 'user_role', 'details', 'ip_address']) {
      assert.equal(names.has(column), true);
    }

    const applied = await isolatedDb.execute('SELECT name FROM schema_migrations');
    assert.deepEqual(applied.rows.map(row => row.name), ['001_initial_schema.sql']);
  } finally {
    await isolatedDb.close();
  }
});
