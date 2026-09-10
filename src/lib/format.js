export function formatCFA(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const STATUS_LABELS = {
  draft: 'Brouillon',
  incomplete: 'À compléter',
  submitted: 'Soumis',
  verification: 'Vérification',
  review: 'Revue',
  review_required: 'Revue requise',
  prequalified: 'Préqualifié',
  committee_ready: 'Prêt pour le comité',
  committee: 'Comité',
  decided: 'Décidé',
  exported: 'Exporté',
  disbursed: 'Décaissé',
  monitoring: 'Suivi',
  closed: 'Clôturé',
  cancelled: 'Annulé',
};

export const STATUS_COLORS = {
  draft: 'gray',
  incomplete: 'amber',
  submitted: 'amber',
  verification: 'amber',
  review: 'amber',
  review_required: 'amber',
  prequalified: 'green',
  committee_ready: 'amber',
  committee: 'amber',
  decided: 'green',
  exported: 'green',
  disbursed: 'green',
  monitoring: 'green',
  closed: 'gray',
  cancelled: 'red',
};

export const ROLE_LABELS = {
  SUPERADMIN: 'Super Administrateur',
  AGENT: 'Agent de crédit',
  SUPERVISEUR: 'Superviseur',
  COMITE: 'Comité de crédit',
  RISK_MANAGER: 'Gestionnaire des risques',
  ADMIN: 'Administrateur',
  AUDITEUR: 'Auditeur',
  SUPPORT: 'Support technique',
  JURY: 'Membre du jury',
};

export const VERIFICATION_LEVELS = {
  A: { label: 'Vérifié source', color: '#dcfce7', textColor: '#166534' },
  B: { label: 'Tiers fiable', color: '#dbeafe', textColor: '#1e40af' },
  C: { label: 'Document non vérifié', color: '#fef3c7', textColor: '#92400e' },
  D: { label: 'Déclaration', color: '#f3f4f6', textColor: '#374151' },
};

export const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export function prequalColor(prequal) {
  if (prequal === 'PREQUALIFIE') return 'green';
  if (prequal === 'REVUE_REQUISE') return 'amber';
  if (prequal === 'NON_ELIGIBLE') return 'red';
  return 'gray';
}

export function prequalLabel(prequal) {
  if (prequal === 'PREQUALIFIE') return 'PRÉQUALIFIÉ';
  if (prequal === 'REVUE_REQUISE') return 'REVUE REQUISE';
  if (prequal === 'NON_ELIGIBLE') return 'NON ÉLIGIBLE';
  return 'En attente';
}

export function scoreStyle(score) {
  if (score > 70) return { color: '#059669', background: '#ecfdf5', border: '#059669', softBorder: '#a7f3d0', label: 'Dossier solide' };
  if (score >= 40) return { color: '#d97706', background: '#fffbeb', border: '#d97706', softBorder: '#fde68a', label: 'Dossier à examiner' };
  return { color: '#dc2626', background: '#fef2f2', border: '#dc2626', softBorder: '#fca5a5', label: 'Dossier fragile' };
}

export function parseScoreDetails(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
