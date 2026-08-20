import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Search } from 'lucide-react';

const ACTION_LABELS = {
  LOGIN: 'Connexion',
  REGISTER: 'Inscription',
  DOSSIER_CREATED: 'Dossier créé',
  DOSSIER_UPDATED: 'Dossier modifié',
  STATUS_CHANGED: 'Statut modifié',
  EVIDENCE_ADDED: 'Preuve ajoutée',
  EVIDENCE_VERIFIED: 'Preuve vérifiée',
  CASHFLOW_UPDATED: 'Cash-flow mis à jour',
  STRESS_TEST_RUN: 'Stress test exécuté',
  RULES_EVALUATED: 'Règles évaluées',
  BIC_CHECK: 'Consultation BIC',
  DECISION_MADE: 'Décision prise',
  DECISION_OVERRIDE: 'Override humain',
  SYNC_PUSH: 'Synchronisation',
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    try {
      const res = await api.getAuditLog({ limit: '200' });
      setLogs(res.logs || []);
    } catch {} finally { setLoading(false); }
  }

  const filtered = logs.filter(l => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (l.user_name || '').toLowerCase().includes(q) ||
           (l.action || '').toLowerCase().includes(q);
  });

  const importantActions = ['DECISION_MADE', 'DECISION_OVERRIDE', 'STATUS_CHANGED'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Journal d'audit</h1>
        <p className="page-subtitle">Historique complet des opérations et décisions</p>
      </div>

      <div className="surface" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--c-400)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Rechercher par utilisateur, action..." value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
      </div>

      <div className="surface">
        {loading ? (
          <div className="loading-state">Chargement du journal...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Aucune entrée d'audit</div>
            <div className="empty-state-desc">Les opérations effectuées sur la plateforme apparaîtront ici.</div>
          </div>
        ) : (
          <div className="audit-timeline">
            {filtered.map(l => {
              const isImportant = importantActions.includes(l.action);
              let detail = '';
              try {
                const d = JSON.parse(l.details || '{}');
                if (l.action === 'STATUS_CHANGED') detail = `${d.from} → ${d.to}`;
                else if (l.action === 'DECISION_MADE' || l.action === 'DECISION_OVERRIDE') detail = `Décision: ${d.decision}${d.amount ? ` — ${d.amount.toLocaleString('fr-FR')} FCFA` : ''}`;
                else if (l.action === 'EVIDENCE_ADDED') detail = `${d.category} — Niveau ${d.level}`;
                else if (l.action === 'RULES_EVALUATED') detail = `Préqualification: ${d.prequalification}`;
              } catch {}

              return (
                <div key={l.id} className={`audit-event ${isImportant ? 'important' : ''}`}>
                  <div className="audit-time">{formatDateTime(l.created_at)}</div>
                  <div className="audit-actor">{l.user_name} <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{l.user_role}</span></div>
                  <div className="audit-action">
                    {ACTION_LABELS[l.action] || l.action}
                    {detail && <span style={{ marginLeft: 8, color: 'var(--c-500)' }}>— {detail}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
