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
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });

  if (res.status === 401) {
    logout();
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  const data = await res.json();
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
  updateDossier: (id, data) => request(`/api/dossiers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateStatus: (id, status) => request(`/api/dossiers/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  decideDossier: (id, data) => request(`/api/dossiers/${id}/decide`, { method: 'POST', body: JSON.stringify(data) }),

  getEvidence: (dossierId) => request(`/api/evidence/dossier/${dossierId}`),
  addEvidence: (data) => request('/api/evidence', { method: 'POST', body: JSON.stringify(data) }),
  verifyEvidence: (id, data) => request(`/api/evidence/${id}/verify`, { method: 'PUT', body: JSON.stringify(data) }),

  getCashflow: (dossierId) => request(`/api/cashflow/dossier/${dossierId}`),
  saveCashflow: (dossierId, entries) => request(`/api/cashflow/dossier/${dossierId}`, { method: 'POST', body: JSON.stringify({ entries }) }),
  runStressTest: (dossierId) => request(`/api/cashflow/dossier/${dossierId}/stress-test`, { method: 'POST' }),

  getRules: () => request('/api/rules'),
  evaluateRules: (dossierId) => request(`/api/rules/evaluate/${dossierId}`, { method: 'POST' }),

  checkBic: (idNumber) => request(`/api/bic/check/${idNumber}`),

  getAuditLog: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/audit${qs ? `?${qs}` : ''}`);
  },
  getDossierAudit: (dossierId) => request(`/api/audit/dossier/${dossierId}`),

  syncPush: (operations) => request('/api/sync/push', { method: 'POST', body: JSON.stringify({ operations }) }),
  syncPull: (since) => request(`/api/sync/pull${since ? `?since=${since}` : ''}`),
  syncStatus: () => request('/api/sync/status'),
};
