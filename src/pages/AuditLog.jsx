import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';

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

function logDetail(log) {
  try {
    const details = JSON.parse(log.details || '{}');
    if (log.action === 'STATUS_CHANGED') return `${details.from} → ${details.to}`;
    if (log.action === 'DECISION_MADE' || log.action === 'DECISION_OVERRIDE') {
      return `Décision : ${details.decision}${details.amount ? ` — ${details.amount.toLocaleString('fr-FR')} FCFA` : ''}`;
    }
    if (log.action === 'EVIDENCE_ADDED') return `${details.category} — Niveau ${details.level}`;
    if (log.action === 'RULES_EVALUATED') return `Préqualification : ${details.prequalification}`;
  } catch {
    return '';
  }
  return '';
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getAuditLog({ limit: '200' });
      setLogs(response.logs || []);
    } catch (err) {
      setError(err.message || 'Impossible de charger le journal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const filtered = logs.filter(log => {
    if (!filter) return true;
    const query = filter.toLowerCase();
    return (log.user_name || '').toLowerCase().includes(query)
      || (log.action || '').toLowerCase().includes(query);
  });
  const importantActions = ['DECISION_MADE', 'DECISION_OVERRIDE', 'STATUS_CHANGED'];

  return (
    <div>
      <PageHeader eyebrow="Traçabilité" title="Journal d’audit" subtitle="Historique append-only des opérations, contrôles et décisions." />

      <Panel className="filter-panel">
        <label className="search-field" htmlFor="audit-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Rechercher dans le journal</span>
          <input
            id="audit-search"
            className="input"
            placeholder="Rechercher par utilisateur ou action…"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
        </label>
      </Panel>

      <Panel>
        {loading ? <LoadingState message="Chargement du journal…" />
          : error ? <ErrorState title="Journal indisponible" message={error} onRetry={loadLogs} />
            : filtered.length === 0 ? (
              <EmptyState
                title={logs.length ? 'Aucun résultat' : 'Aucune entrée d’audit'}
                description={logs.length ? 'Modifiez votre recherche pour afficher d’autres opérations.' : 'Les opérations effectuées sur la plateforme apparaîtront ici.'}
              />
            ) : (
              <div className="audit-timeline">
                {filtered.map(log => {
                  const detail = logDetail(log);
                  return (
                    <article key={log.id} className={`audit-event ${importantActions.includes(log.action) ? 'important' : ''}`}>
                      <time className="audit-time" dateTime={log.created_at}>{formatDateTime(log.created_at)}</time>
                      <div className="audit-actor">
                        {log.user_name || 'Système'} <StatusBadge tone="neutral">{log.user_role || 'SYSTEM'}</StatusBadge>
                      </div>
                      <div className="audit-action">
                        <strong>{ACTION_LABELS[log.action] || log.action}</strong>
                        {detail && <span className="audit-detail">— {detail}</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
      </Panel>
    </div>
  );
}
