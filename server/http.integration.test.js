import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from './index.js';
import { generateToken, hashPassword } from './auth.js';

const tenantA = 'tenant-http-a';
const tenantB = 'tenant-http-b';
const owner = { id: 'agent-owner', tenant_id: tenantA, role: 'AGENT', name: 'Agent propriétaire' };
const otherAgent = { id: 'agent-other', tenant_id: tenantA, role: 'AGENT', name: 'Autre agent' };
const tenantBAgent = { id: 'agent-b', tenant_id: tenantB, role: 'AGENT', name: 'Agent tenant B' };
const supervisor = { id: 'supervisor-a', tenant_id: tenantA, role: 'SUPERVISEUR', name: 'Superviseur A' };
const auditor = { id: 'auditor-a', tenant_id: tenantA, role: 'AUDITEUR', name: 'Auditeur A' };
const committee = { id: 'committee-a', tenant_id: tenantA, role: 'COMITE', name: 'Comité A' };
const validPdfBase64 = Buffer.from('%PDF-1.4\nsynthetic-evidence').toString('base64');

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

async function request(baseUrl, path, user, options = {}) {
  const headers = { Authorization: `Bearer ${generateToken(user)}`, ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, body: await response.json() };
}

async function insertFixtures(db) {
  for (const tenant of [[tenantA, 'Tenant A', 'HTTP-A'], [tenantB, 'Tenant B', 'HTTP-B']]) {
    await db.execute({ sql: 'INSERT INTO tenants (id, name, code) VALUES (?, ?, ?)', args: tenant });
  }
  for (const user of [owner, otherAgent, tenantBAgent, supervisor, auditor, committee]) {
    await db.execute({
      sql: `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [user.id, user.tenant_id, `${user.id}@test.local`, hashPassword('test-password'), user.name, user.role],
    });
  }
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name, applicant_id_number, sector)
          VALUES ('dossier-owned', ?, ?, 'draft', 'Demandeur synthétique', 'SN-HTTP-001', 'Agriculture')`,
    args: [tenantA, owner.id],
  });
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name, applicant_id_number, sector)
          VALUES ('dossier-other-tenant', ?, ?, 'draft', 'Autre synthétique', 'SN-HTTP-002', 'Agriculture')`,
    args: [tenantB, tenantBAgent.id],
  });
}

let db;
test.before(async () => {
  process.env.TURSO_DATABASE_URL = 'file::memory:';
  const dbModule = await import('./db.js');
  db = await dbModule.initDb();
  await insertFixtures(db);
});

test('isole le dossier par tenant et propriété Agent', async () => {
  await withServer(async baseUrl => {
    const own = await request(baseUrl, '/api/dossiers/dossier-owned', owner);
    assert.equal(own.response.status, 200);
    assert.equal(own.body.dossier.id, 'dossier-owned');

    const other = await request(baseUrl, '/api/dossiers/dossier-owned', otherAgent);
    assert.equal(other.response.status, 404);

    const crossTenant = await request(baseUrl, '/api/dossiers/dossier-owned', tenantBAgent);
    assert.equal(crossTenant.response.status, 404);
  });
});

test('refuse immédiatement le jeton d’un compte désactivé', async () => {
  await db.execute({
    sql: 'UPDATE users SET active = 0 WHERE id = ? AND tenant_id = ?',
    args: [otherAgent.id, tenantA],
  });
  await withServer(async baseUrl => {
    const denied = await request(baseUrl, '/api/dossiers/dossier-owned', otherAgent);
    assert.equal(denied.response.status, 401);
  });
  await db.execute({
    sql: 'UPDATE users SET active = 1 WHERE id = ? AND tenant_id = ?',
    args: [otherAgent.id, tenantA],
  });
});

test('applique les transitions RBAC et impose la route de décision', async () => {
  await withServer(async baseUrl => {
    const forbiddenAgent = await request(baseUrl, '/api/dossiers/dossier-owned/status', otherAgent, {
      method: 'PUT', body: { status: 'submitted' },
    });
    assert.equal(forbiddenAgent.response.status, 404);

    const submitted = await request(baseUrl, '/api/dossiers/dossier-owned/status', owner, {
      method: 'PUT', body: { status: 'submitted' },
    });
    assert.equal(submitted.response.status, 200);

    const agentReview = await request(baseUrl, '/api/dossiers/dossier-owned/status', owner, {
      method: 'PUT', body: { status: 'verification' },
    });
    assert.equal(agentReview.response.status, 403);

    const supervisorReview = await request(baseUrl, '/api/dossiers/dossier-owned/status', supervisor, {
      method: 'PUT', body: { status: 'verification' },
    });
    assert.equal(supervisorReview.response.status, 200);

    const directDecision = await request(baseUrl, '/api/dossiers/dossier-owned/status', supervisor, {
      method: 'PUT', body: { status: 'decided' },
    });
    assert.equal(directDecision.response.status, 403);
  });
});

test('impose le passage au comité et réserve la décision finale', async () => {
  await db.execute({
    sql: "UPDATE dossiers SET status = 'review' WHERE id = 'dossier-owned' AND tenant_id = ?",
    args: [tenantA],
  });
  await withServer(async baseUrl => {
    const premature = await request(baseUrl, '/api/dossiers/dossier-owned/decide', committee, {
      method: 'POST', body: { decision: 'approved', motif: 'Projet synthétique viable' },
    });
    assert.equal(premature.response.status, 409);

    await db.execute({
      sql: "UPDATE dossiers SET status = 'committee' WHERE id = 'dossier-owned' AND tenant_id = ?",
      args: [tenantA],
    });
    const invalidDecision = await request(baseUrl, '/api/dossiers/dossier-owned/decide', committee, {
      method: 'POST', body: { decision: 'automatic', motif: 'Valeur invalide synthétique' },
    });
    assert.equal(invalidDecision.response.status, 400);

    const forbiddenSupervisor = await request(baseUrl, '/api/dossiers/dossier-owned/decide', supervisor, {
      method: 'POST', body: { decision: 'approved', motif: 'Avis superviseur' },
    });
    assert.equal(forbiddenSupervisor.response.status, 403);

    const decided = await request(baseUrl, '/api/dossiers/dossier-owned/decide', committee, {
      method: 'POST', body: { decision: 'approved', motif: 'Décision humaine motivée' },
    });
    assert.equal(decided.response.status, 200);
    assert.equal(decided.body.decision, 'approved');
  });
});

test('protège les routes enfants et les mutations de brouillon', async () => {
  await db.execute({
    sql: "UPDATE dossiers SET status = 'draft' WHERE id = 'dossier-owned' AND tenant_id = ?",
    args: [tenantA],
  });
  await withServer(async baseUrl => {
    const hiddenCashflow = await request(baseUrl, '/api/cashflow/dossier/dossier-owned', otherAgent);
    assert.equal(hiddenCashflow.response.status, 404);

    const saved = await request(baseUrl, '/api/cashflow/dossier/dossier-owned', owner, {
      method: 'POST', body: { entries: [{ month: 1, year: 2026, revenue: 100000, expenses: 20000 }] },
    });
    assert.equal(saved.response.status, 200);

    await db.execute({
      sql: "UPDATE dossiers SET status = 'submitted' WHERE id = 'dossier-owned' AND tenant_id = ?",
      args: [tenantA],
    });
    const locked = await request(baseUrl, '/api/cashflow/dossier/dossier-owned', owner, {
      method: 'POST', body: { entries: [{ month: 2, year: 2026, revenue: 100000 }] },
    });
    assert.equal(locked.response.status, 409);

    const auditHidden = await request(baseUrl, '/api/audit/dossier/dossier-owned', otherAgent);
    assert.equal(auditHidden.response.status, 403);
    const auditVisible = await request(baseUrl, '/api/audit/dossier/dossier-owned', auditor);
    assert.equal(auditVisible.response.status, 200);
  });
});

test('exige un consentement explicite et un dossier accessible pour la démo BIC', async () => {
  await db.execute({
    sql: "UPDATE dossiers SET status = 'draft' WHERE id = 'dossier-owned' AND tenant_id = ?",
    args: [tenantA],
  });
  await withServer(async baseUrl => {
    const missingConsent = await request(baseUrl, '/api/bic/check/dossier-owned', owner);
    assert.equal(missingConsent.response.status, 403);

    const hidden = await request(baseUrl, '/api/bic/check/dossier-owned', otherAgent);
    assert.equal(hidden.response.status, 404);

    const recorded = await request(baseUrl, '/api/consent', owner, {
      method: 'POST',
      body: { dossier_id: 'dossier-owned', consent_type: 'bic_check', consent_given: true },
    });
    assert.equal(recorded.response.status, 200);

    const checked = await request(baseUrl, '/api/bic/check/dossier-owned', owner);
    assert.equal(checked.response.status, 200);
    assert.equal(checked.body.connected, false);
    assert.equal(checked.body.is_demo, true);
  });
});


test('gère les preuves et pièces jointes sans accès inter-Agent', async () => {
  await db.execute({
    sql: "UPDATE dossiers SET status = 'draft' WHERE id = 'dossier-owned' AND tenant_id = ?",
    args: [tenantA],
  });
  await withServer(async baseUrl => {
    const created = await request(baseUrl, '/api/evidence', owner, {
      method: 'POST',
      body: {
        id: 'evidence-http', dossier_id: 'dossier-owned', category: 'IDENTITE',
        label: 'CNI synthétique', source: 'document', verification_level: 'C',
      },
    });
    assert.equal(created.response.status, 200);

    const saved = await request(baseUrl, '/api/evidence/evidence-http/attachment', owner, {
      method: 'PUT',
      body: { original_name: 'cni-synthetique.pdf', mime_type: 'application/pdf', content_base64: validPdfBase64 },
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.size > 0, true);

    const forbiddenDownload = await request(baseUrl, '/api/evidence/evidence-http/attachment', otherAgent);
    assert.equal(forbiddenDownload.response.status, 404);

    const replaced = await request(baseUrl, '/api/evidence/evidence-http/attachment', owner, {
      method: 'PUT',
      body: { original_name: 'cni-remplacee.pdf', mime_type: 'application/pdf', content_base64: validPdfBase64 },
    });
    assert.equal(replaced.response.status, 200);

    const deleted = await request(baseUrl, '/api/evidence/evidence-http/attachment', owner, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200);
  });
});

test('limite les pièces jointes à dix mégaoctets par dossier', async () => {
  const fullSizePdf = Buffer.alloc(2 * 1024 * 1024);
  fullSizePdf.write('%PDF-1.4\n');
  const fullSizePdfBase64 = fullSizePdf.toString('base64');

  await withServer(async baseUrl => {
    for (let index = 1; index <= 6; index += 1) {
      const evidenceId = `evidence-limit-${index}`;
      const created = await request(baseUrl, '/api/evidence', owner, {
        method: 'POST',
        body: {
          id: evidenceId, dossier_id: 'dossier-owned', category: 'DOCUMENT',
          label: `Pièce synthétique ${index}`, source: 'document', verification_level: 'C',
        },
      });
      assert.equal(created.response.status, 200);

      const uploaded = await request(baseUrl, `/api/evidence/${evidenceId}/attachment`, owner, {
        method: 'PUT',
        body: {
          original_name: `piece-synthetique-${index}.pdf`,
          mime_type: 'application/pdf',
          content_base64: index <= 5 ? fullSizePdfBase64 : validPdfBase64,
        },
      });
      assert.equal(uploaded.response.status, index <= 5 ? 200 : 413);
      if (index === 6) assert.match(uploaded.body.error, /10 Mo par dossier/);
    }
  });
});
