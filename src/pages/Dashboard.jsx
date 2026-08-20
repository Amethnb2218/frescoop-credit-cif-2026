import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, STATUS_LABELS, prequalLabel, prequalColor } from '../lib/format';
import { isOnline, getSyncQueue } from '../lib/offline';
import { Plus, FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export default function Dashboard() {
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const user = getUser();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      if (isOnline()) {
        const res = await api.getDossiers();
        setDossiers(res.dossiers || []);
      }
      const queue = await getSyncQueue();
      setPendingSync(queue.length);
    } catch {} finally { setLoading(false); }
  }

  const role = user?.role;
  const stats = {
    total: dossiers.length,
    draft: dossiers.filter(d => d.status === 'draft').length,
    pending: dossiers.filter(d => ['submitted', 'verification', 'review'].includes(d.status)).length,
    committee: dossiers.filter(d => d.status === 'committee').length,
    decided: dossiers.filter(d => ['decided', 'exported', 'disbursed'].includes(d.status)).length,
    prequalified: dossiers.filter(d => d.prequalification === 'PREQUALIFIE').length,
    reviewRequired: dossiers.filter(d => d.prequalification === 'REVUE_REQUISE').length,
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="page-title">Tableau de bord</h1>
            <p className="page-subtitle">
              {isOnline() ? (
                <span className="network-status"><span className="network-dot online"></span> Connecté</span>
              ) : (
                <span className="network-status"><span className="network-dot offline"></span> Hors connexion</span>
              )}
              {pendingSync > 0 && <span style={{ marginLeft: 16 }} className="badge badge-warning">{pendingSync} en attente de synchronisation</span>}
            </p>
          </div>
          {['AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'].includes(role) && (
            <Link to="/dossiers/new" className="btn btn-primary"><Plus size={16} /> Nouveau dossier</Link>
          )}
        </div>
      </div>

      {/* Agent view */}
      {role === 'AGENT' && (
        <>
          <div className="metrics-row">
            <div className="metric-card">
              <div className="metric-value">{stats.draft}</div>
              <div className="metric-label">Brouillons à compléter</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.pending}</div>
              <div className="metric-label">En cours d'instruction</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.decided}</div>
              <div className="metric-label">Décidés</div>
            </div>
          </div>
          <AgentActionList dossiers={dossiers} loading={loading} />
        </>
      )}

      {/* Committee view */}
      {role === 'COMITE' && (
        <>
          <div className="metrics-row">
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--c-warning)' }}>{stats.committee}</div>
              <div className="metric-label">Dossiers à examiner</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.decided}</div>
              <div className="metric-label">Décisions prises</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.prequalified}</div>
              <div className="metric-label">Préqualifiés</div>
            </div>
          </div>
          <CommitteeQueue dossiers={dossiers.filter(d => d.status === 'committee')} loading={loading} />
        </>
      )}

      {/* Supervisor / Risk Manager / Admin / SuperAdmin view */}
      {['SUPERVISEUR', 'RISK_MANAGER', 'ADMIN', 'SUPERADMIN'].includes(role) && (
        <>
          <div className="metrics-row">
            <div className="metric-card">
              <div className="metric-value">{stats.total}</div>
              <div className="metric-label">Total dossiers</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--c-warning)' }}>{stats.pending}</div>
              <div className="metric-label">En instruction</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--c-warning)' }}>{stats.committee}</div>
              <div className="metric-label">En attente comité</div>
            </div>
            <div className="metric-card">
              <div className="metric-value" style={{ color: 'var(--c-success)' }}>{stats.decided}</div>
              <div className="metric-label">Décidés</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="surface">
              <div className="surface-title">Préqualification</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Row icon={<CheckCircle size={16} color="var(--c-success)" />} label="Préqualifiés" count={stats.prequalified} />
                <Row icon={<AlertTriangle size={16} color="var(--c-warning)" />} label="Revue requise" count={stats.reviewRequired} />
                <Row icon={<Clock size={16} color="var(--c-400)" />} label="Non évalués" count={dossiers.filter(d => !d.prequalification).length} />
              </div>
            </div>
            <div className="surface">
              <div className="surface-title">Dossiers récents nécessitant une action</div>
              {dossiers.filter(d => ['submitted', 'verification', 'review'].includes(d.status)).slice(0, 5).map(d => (
                <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--c-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-base)' }}>{d.applicant_name || 'Sans nom'}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-500)' }}>{formatCFA(d.amount_requested)}</div>
                  </div>
                  <Link to={`/dossiers/${d.id}`} className="btn btn-secondary btn-sm">Ouvrir</Link>
                </div>
              ))}
              {dossiers.filter(d => ['submitted', 'verification', 'review'].includes(d.status)).length === 0 && (
                <p style={{ color: 'var(--c-500)', fontSize: 'var(--fs-base)' }}>Aucun dossier ne nécessite une action pour le moment.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Auditor view */}
      {role === 'AUDITEUR' && (
        <>
          <div className="metrics-row">
            <div className="metric-card">
              <div className="metric-value">{stats.total}</div>
              <div className="metric-label">Dossiers consultables</div>
            </div>
            <div className="metric-card">
              <div className="metric-value">{stats.decided}</div>
              <div className="metric-label">Décisions auditables</div>
            </div>
          </div>
          <div className="surface">
            <div className="surface-title">Accès rapide</div>
            <p style={{ color: 'var(--c-600)', marginBottom: 16 }}>Consultez le journal d'audit pour retracer l'historique complet des opérations.</p>
            <Link to="/audit" className="btn btn-primary"><BookOpen size={16} /> Ouvrir le journal d'audit</Link>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ icon, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {icon}
      <span style={{ flex: 1, fontSize: 'var(--fs-base)' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 'var(--fs-md)' }}>{count}</span>
    </div>
  );
}

function AgentActionList({ dossiers, loading }) {
  const actionable = dossiers.filter(d => d.status === 'draft' || d.status === 'submitted');
  if (loading) return <div className="loading-state">Chargement...</div>;

  return (
    <div className="surface">
      <div className="surface-header">
        <div className="surface-title" style={{ margin: 0 }}>Mes dossiers à compléter</div>
        <Link to="/dossiers" className="btn btn-secondary btn-sm">Voir tous</Link>
      </div>
      {actionable.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucun dossier en attente</div>
          <div className="empty-state-desc">Créez un nouveau dossier pour commencer l'instruction d'une demande de crédit.</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Demandeur</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {actionable.slice(0, 8).map(d => (
                <tr key={d.id}>
                  <td><div className="table-cell-primary">{d.applicant_name || 'Non renseigné'}</div><div className="table-cell-secondary">{d.applicant_location}</div></td>
                  <td>{formatCFA(d.amount_requested)}</td>
                  <td><span className={`badge badge-${d.status === 'draft' ? 'neutral' : 'warning'}`}>{STATUS_LABELS[d.status]}</span></td>
                  <td><Link to={`/dossiers/${d.id}`} className="btn btn-secondary btn-sm">Continuer</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CommitteeQueue({ dossiers, loading }) {
  if (loading) return <div className="loading-state">Chargement...</div>;

  return (
    <div className="surface">
      <div className="surface-title">Dossiers en attente de décision</div>
      {dossiers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Aucun dossier à examiner</div>
          <div className="empty-state-desc">Les dossiers apparaîtront ici lorsqu'ils auront été transmis par un superviseur.</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Demandeur</th><th>Montant</th><th>Préqualification</th><th></th></tr></thead>
            <tbody>
              {dossiers.map(d => (
                <tr key={d.id}>
                  <td><div className="table-cell-primary">{d.applicant_name}</div><div className="table-cell-secondary">{d.activity_type} — {d.applicant_location}</div></td>
                  <td style={{ fontWeight: 600 }}>{formatCFA(d.amount_requested)}</td>
                  <td>{d.prequalification ? <span className={`badge badge-${prequalColor(d.prequalification) === 'green' ? 'success' : prequalColor(d.prequalification) === 'amber' ? 'warning' : 'error'}`}>{prequalLabel(d.prequalification)}</span> : '—'}</td>
                  <td><Link to={`/dossiers/${d.id}`} className="btn btn-primary btn-sm">Examiner</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
