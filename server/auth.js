import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';

const SECRET = process.env.TOKEN_SECRET || 'frescoop-dev-secret-change-in-prod';
const TOKEN_EXPIRY = '24h';

export function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id, role: user.role, name: user.name },
    SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requis' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.user = payload;
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
