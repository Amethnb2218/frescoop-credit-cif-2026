const API_BASE = '';

let token = localStorage.getItem('frescoop_token');
let currentUser = JSON.parse(localStorage.getItem('frescoop_user') || 'null');

export function getToken() { return token; }
export function getUser() { return currentUser; }
export function isLoggedIn() { return !!token && !!currentUser; }

export function setAuth(newToken, user) {
  token = newToken;
  currentUser = user;
  localStorage.setItem('frescoop_token', newToken);
  localStorage.setItem('frescoop_user', JSON.stringify(user));
}

export function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('frescoop_token');
  localStorage.removeItem('frescoop_user');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !path.includes('/auth/login')) {
    logout();
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

export const api = {
  health: () => request('/api/health'),

  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/api/auth/me'),

  getDossiers: (status) => request(`/api/dossiers${status ? `?status=${status}` : ''}`),
  getDossier: (id) => request(`/api/dossiers/${id}`),
  createDossier: (data) => request('/api/dossiers', { method: 'POST', body: JSON.stringify(data) }),
  assessAgriculturalFeasibility: (data, signal) => request('/api/dossiers/agricultural-feasibility', {
    method: 'POST', body: JSON.stringify(data), signal,
  }),
  updateDossier: (id, data) => request(`/api/dossiers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateStatus: (id, status) => request(`/api/dossiers/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  resubmitDossier: (id, data = {}) => request(`/api/dossiers/${id}/resubmit`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  decideDossier: (id, data) => request(`/api/dossiers/${id}/decide`, { method: 'POST', body: JSON.stringify(data) }),

  getEvidence: (dossierId) => request(`/api/evidence/dossier/${dossierId}`),
  addEvidence: (data) => request('/api/evidence', { method: 'POST', body: JSON.stringify(data) }),
  updateEvidence: (id, data) => request(`/api/evidence/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvidence: (id) => request(`/api/evidence/${id}`, { method: 'DELETE' }),
  verifyEvidence: (id, data) => request(`/api/evidence/${id}/verify`, { method: 'PUT', body: JSON.stringify(data) }),
  saveEvidenceAttachment: (id, data) => request(`/api/evidence/${id}/attachment`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvidenceAttachment: (id) => request(`/api/evidence/${id}/attachment`, { method: 'DELETE' }),
  downloadEvidenceAttachment: async (id) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/evidence/${id}/attachment`, { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Téléchargement impossible');
    }
    return { blob: await res.blob(), disposition: res.headers.get('Content-Disposition') || '' };
  },

  getCashflow: (dossierId) => request(`/api/cashflow/dossier/${dossierId}`),
  saveCashflow: (dossierId, entries) => request(`/api/cashflow/dossier/${dossierId}`, { method: 'POST', body: JSON.stringify({ entries }) }),
  runStressTest: (dossierId) => request(`/api/cashflow/dossier/${dossierId}/stress-test`, { method: 'POST' }),

  getRules: () => request('/api/rules'),
  evaluateRules: (dossierId) => request(`/api/rules/evaluate/${dossierId}`, { method: 'POST' }),

  checkBic: (dossierId) => request(`/api/bic/check/${dossierId}`),

  getAuditLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/audit${qs ? `?${qs}` : ''}`);
  },
  getDossierAudit: (dossierId) => request(`/api/audit/dossier/${dossierId}`),

  syncPush: (operations) => request('/api/sync/push', { method: 'POST', body: JSON.stringify({ operations }) }),
  syncPull: (since) => request(`/api/sync/pull${since ? `?since=${since}` : ''}`),
  syncStatus: () => request('/api/sync/status'),

  // Products
  getProducts: () => request('/api/products'),
  createProduct: (data) => request('/api/products', { method: 'POST', body: JSON.stringify(data) }),

  // Field visits
  getVisits: (dossierId) => request(`/api/visits/dossier/${dossierId}`),
  createVisit: (data) => request('/api/visits', { method: 'POST', body: JSON.stringify(data) }),

  // Consent
  getConsents: (dossierId) => request(`/api/consent/dossier/${dossierId}`),
  createConsent: (data) => request('/api/consent', { method: 'POST', body: JSON.stringify(data) }),

  // Fraud checks
  runFraudCheck: (dossierId) => request(`/api/fraud/check/${dossierId}`, { method: 'POST' }),
  getFraudChecks: (dossierId) => request(`/api/fraud/dossier/${dossierId}`),

  // Export
  getMemo: (dossierId) => request(`/api/export/memo/${dossierId}/json`),

  // Stats
  getStats: () => request('/api/stats'),

  // Users (admin)
  getUsers: () => request('/api/auth/users'),
  resetUserPassword: (userId, new_password) => request(`/api/auth/users/${userId}/reset-password`, { method: 'PUT', body: JSON.stringify({ new_password }) }),
  toggleUser: (userId) => request(`/api/auth/users/${userId}/toggle`, { method: 'PUT' }),
  changePassword: (current_password, new_password) => request('/api/auth/password', { method: 'PUT', body: JSON.stringify({ current_password, new_password }) }),
};
