import jwt from 'jsonwebtoken';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { getDb } from './db.js';

const DEVELOPMENT_SECRET = 'frescoop-dev-secret-change-in-prod';
const TOKEN_EXPIRY = '24h';

function getSecret() {
  const secret = process.env.TOKEN_SECRET;
  if (secret?.trim()) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TOKEN_SECRET est requis en production');
  }
  return DEVELOPMENT_SECRET;
}

export function assertAuthConfiguration() {
  getSecret();
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith('scrypt:')) {
    const legacy = createHash('sha256').update(password).digest('hex');
    const expected = Buffer.from(storedHash, 'hex');
    const actual = Buffer.from(legacy, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  const [, salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, role: user.role, name: user.name },
    getSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requis' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT id, tenant_id, name, role FROM users
            WHERE id = ? AND tenant_id = ? AND active = 1`,
      args: [payload.id, payload.tenant_id],
    });
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Compte inexistant ou désactivé' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

const ROLE_HIERARCHY = {
  SUPERADMIN: 9,
  ADMIN: 8,
  SUPPORT: 7,
  RISK_MANAGER: 6,
  JURY: 5,
  COMITE: 4,
  SUPERVISEUR: 3,
  AUDITEUR: 2,
  AGENT: 1,
};

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour ce rôle' });
    }
    next();
  };
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Niveau d\'accès insuffisant' });
    }
    next();
  };
}

export function tenantGuard(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  req.tenantId = req.user.tenant_id;
  next();
}
