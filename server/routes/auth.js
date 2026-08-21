import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { hashPassword, generateToken, authMiddleware } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ? AND active = 1',
      args: [email.toLowerCase().trim()],
    });

    const user = result.rows[0];
    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = generateToken(user);
    await logAudit(user.tenant_id, user.id, user.name, user.role, 'LOGIN', 'user', user.id, {}, req);

    res.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id, agency: user.agency },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT id, tenant_id, email, name, role, phone, agency, created_at FROM users WHERE id = ?',
      args: [req.user.id],
    });
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ ok: true, user });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, phone, agency, tenant_id } = req.body;
    if (!email || !password || !name || !role || !tenant_id) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const validRoles = ['SUPERADMIN', 'AGENT', 'SUPERVISEUR', 'COMITE', 'RISK_MANAGER', 'ADMIN', 'AUDITEUR', 'SUPPORT'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    const db = getDb();
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      args: [tenant_id, email.toLowerCase().trim()],
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Cet email existe déjà' });
    }

    const id = uuid();
    await db.execute({
      sql: `INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone, agency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, tenant_id, email.toLowerCase().trim(), hashPassword(password), name, role, phone || null, agency || null],
    });

    const token = generateToken({ id, tenant_id, role, name });
    await logAudit(tenant_id, id, name, role, 'REGISTER', 'user', id, { email }, req);

    res.json({
      ok: true,
      token,
      user: { id, name, email: email.toLowerCase().trim(), role, tenant_id, agency },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Change own password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });

    const db = getDb();
    const result = await db.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [req.user.id] });
    if (!result.rows[0] || result.rows[0].password_hash !== hashPassword(current_password)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hashPassword(new_password), req.user.id] });
    await logAudit(req.user.tenant_id, req.user.id, req.user.name, req.user.role, 'PASSWORD_CHANGE', 'user', req.user.id, {}, req);
    res.json({ ok: true, message: 'Mot de passe modifié' });
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Admin: reset user password
router.put('/users/:userId/reset-password', authMiddleware, async (req, res) => {
  try {
    if (!['ADMIN', 'SUPERADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    const { new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: 'Nouveau mot de passe requis' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

    const db = getDb();
    const user = await db.execute({ sql: 'SELECT id, name FROM users WHERE id = ? AND tenant_id = ?', args: [req.params.userId, req.user.tenant_id] });
    if (!user.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });

    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hashPassword(new_password), req.params.userId] });
    await logAudit(req.user.tenant_id, req.user.id, req.user.name, req.user.role, 'PASSWORD_RESET', 'user', req.params.userId, { target_name: user.rows[0].name }, req);
    res.json({ ok: true, message: `Mot de passe réinitialisé pour ${user.rows[0].name}` });
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Admin: list users
router.get('/users', authMiddleware, async (req, res) => {
  try {
    if (!['ADMIN', 'SUPERADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT id, email, name, role, phone, agency, active, created_at FROM users WHERE tenant_id = ? ORDER BY name', args: [req.user.tenant_id] });
    res.json({ ok: true, users: result.rows });
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Admin: toggle user active
router.put('/users/:userId/toggle', authMiddleware, async (req, res) => {
  try {
    if (!['ADMIN', 'SUPERADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    const db = getDb();
    const user = await db.execute({ sql: 'SELECT id, name, active FROM users WHERE id = ? AND tenant_id = ?', args: [req.params.userId, req.user.tenant_id] });
    if (!user.rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const newActive = user.rows[0].active ? 0 : 1;
    await db.execute({ sql: 'UPDATE users SET active = ? WHERE id = ?', args: [newActive, req.params.userId] });
    await logAudit(req.user.tenant_id, req.user.id, req.user.name, req.user.role, newActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'user', req.params.userId, { target_name: user.rows[0].name }, req);
    res.json({ ok: true, active: !!newActive });
  } catch { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
