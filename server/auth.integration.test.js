import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createClient } from '@libsql/client';
import { app } from './index.js';
import { assertAuthConfiguration, hashPassword } from './auth.js';
import { getDb, initDb, migrateAuditLogSchema } from './db.js';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  TOKEN_SECRET: process.env.TOKEN_SECRET,
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
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

test.before(async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.TOKEN_SECRET;
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  delete process.env.TURSO_AUTH_TOKEN;
  const db = await initDb();
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

test.after(restoreEnv);

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

test('migre un ancien schéma audit_log de façon idempotente', async () => {
  const legacyDb = createClient({ url: 'file::memory:' });
  await legacyDb.executeMultiple(`
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const firstMigration = await migrateAuditLogSchema(legacyDb);
  assert.deepEqual(firstMigration, ['user_name', 'user_role', 'details', 'ip_address']);
  const secondMigration = await migrateAuditLogSchema(legacyDb);
  assert.deepEqual(secondMigration, []);

  const info = await legacyDb.execute('PRAGMA table_info(audit_log)');
  const columns = new Set(info.rows.map(row => String(row.name)));
  for (const column of ['user_name', 'user_role', 'details', 'ip_address']) {
    assert.equal(columns.has(column), true);
  }

  await legacyDb.execute({
    sql: `INSERT INTO audit_log
          (id, tenant_id, user_id, user_name, user_role, action, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['audit-legacy', 'tenant-legacy', 'user-legacy', 'Test', 'ADMIN', 'LOGIN', '{}', '127.0.0.1'],
  });
  const inserted = await legacyDb.execute('SELECT action FROM audit_log WHERE id = ?', ['audit-legacy']);
  assert.equal(inserted.rows[0].action, 'LOGIN');
  legacyDb.close();
});
