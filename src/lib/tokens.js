export const WORKFLOW_STEPS = [
  { key: 'draft', label: 'Brouillon' },
  { key: 'submitted', label: 'Soumis' },
  { key: 'verification', label: 'Vérification' },
  { key: 'review', label: 'Revue' },
  { key: 'committee', label: 'Comité' },
  { key: 'decided', label: 'Décidé' },
  { key: 'exported', label: 'Exporté' },
  { key: 'disbursed', label: 'Décaissé' },
  { key: 'monitoring', label: 'Suivi' },
  { key: 'closed', label: 'Clôturé' },
];

export const EVIDENCE_LEVELS = {
  A: 'A — Source vérifiée',
  B: 'B — Tiers fiable',
  C: 'C — Document non vérifié',
  D: 'D — Déclaration du demandeur',
};

export const ROLE_NAV = {
  SUPERADMIN: ['dashboard', 'dossiers', 'rules', 'stats', 'products', 'audit', 'admin'],
  ADMIN: ['dashboard', 'dossiers', 'rules', 'stats', 'products', 'audit', 'admin'],
  SUPPORT: ['dashboard', 'dossiers', 'stats', 'audit', 'admin'],
  RISK_MANAGER: ['dashboard', 'dossiers', 'rules', 'stats', 'products', 'audit'],
  COMITE: ['dashboard', 'dossiers', 'decisions'],
  SUPERVISEUR: ['dashboard', 'dossiers', 'rules', 'stats'],
  AUDITEUR: ['dashboard', 'audit', 'dossiers', 'stats'],
  AGENT: ['dashboard', 'dossiers', 'sync'],
  JURY: ['dashboard', 'dossiers', 'stats'],
};
