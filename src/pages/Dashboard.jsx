import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle, Clock, FileText, Plus } from 'lucide-react';
import { api, getUser } from '../lib/api';
import { formatCFA, isScoreAvailable, prequalColor, prequalLabel, STATUS_LABELS } from '../lib/format';
import { getSyncQueue, isOnline } from '../lib/offline';

const CAN_CREATE = ['AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'];
const MANAGEMENT_ROLES = ['SUPERVISEUR', 'RISK_MANAGER', 'ADMIN', 'SUPERADMIN', 'SUPPORT'];

function actionableForRole(dossiers, role) {
  if (role === 'AGENT') return dossiers.filter(d => ['draft', 'incomplete', 'submitted'].includes(d.status));
  if (role === 'COMITE') return dossiers.filter(d => ['committee_ready', 'committee'].includes(d.status));
  if (role === 'AUDITEUR') return dossiers.filter(d => ['decided', 'exported', 'disbursed'].includes(d.status));
  if (role === 'JURY') return dossiers.filter(d => d.prequalification);
  return dossiers.filter(d => ['submitted', 'verification', 'review', 'committee_ready'].includes(d.status));
}

export default function Dashboard() {
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingSync, setPendingSync] = useState(0);
  const user = getUser();
  const online = isOnline();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      if (isOnline()) {
        const res = await api.getDossiers();
        setDossiers(res.dossiers || []);
      }
      const queue = await getSyncQueue();
      setPendingSync(queue.length);
    } catch (err) {
      setError(err.message || 'Les données du tableau de bord sont indisponibles.');
    } finally {
      setLoading(false);
    }
  }

  const role = user?.role;
  const actions = actionableForRole(dossiers, role);
  const stats = {
    total: dossiers.length,
    draft: dossiers.filter(d => ['draft', 'incomplete'].includes(d.status)).length,
    pending: dossiers.filter(d => ['submitted', 'verification', 'review'].includes(d.status)).length,
    committee: dossiers.filter(d => ['committee_ready', 'committee'].includes(d.status)).length,
    decided: dossiers.filter(d => ['decided', 'exported', 'disbursed'].includes(d.status)).length,
    prequalified: dossiers.filter(d => d.prequalification === 'PREQUALIFIE').length,
    reviewRequired: dossiers.filter(d => d.prequalification === 'REVUE_REQUISE').length,
  };
  const scored = dossiers.filter(d => isScoreAvailable(d.prequalification_score));
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, dossier) => sum + Number(dossier.prequalification_score), 0) / scored.length)
    : null;

  return (
    <div className="dashboard-page">
      <header className="page-header page-header-row">
        <div>
          <p className="page-kicker">Espace de travail</p>
          <h1 className="page-title">Tableau de bord</h1>
          <div className="dashboard-connectivity">
            <span className="network-status"><span className={`network-dot ${online ? 'online' : 'offline'}`} />{online ? 'Données en ligne' : 'Mode hors connexion'}</span>
            {pendingSync > 0 && <span className="badge badge-warning">{pendingSync} opération{pendingSync > 1 ? 's' : ''} à synchroniser</span>}
          </div>
        </div>
        {CAN_CREATE.includes(role) && <Link to="/dossiers/new" className="btn btn-primary"><Plus size={17} /> Nouveau dossier</Link>}
      </header>

      {!online && (
        <div className="alert alert-warning" role="status">
          <AlertTriangle size={18} />
          <div><strong>Vue non actualisée</strong><p>Reconnectez-vous pour charger les dossiers les plus récents. Les opérations locales restent conservées.</p></div>
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          <AlertTriangle size={18} />
          <div><strong>Chargement impossible</strong><p>{error}</p><button className="btn btn-secondary btn-sm" onClick={loadData}>Réessayer</button></div>
        </div>
      )}

      <section className="dashboard-priority" aria-labelledby="priority-title">
        <div className="section-heading">
          <div><p className="section-eyebrow">Priorité</p><h2 id="priority-title">À traiter maintenant</h2></div>
          <Link to="/dossiers" className="btn btn-secondary btn-sm">Voir tous les dossiers</Link>
        </div>
        <ActionList dossiers={actions} loading={loading} role={role} />
      </section>

      <section aria-labelledby="activity-title">
        <div className="section-heading"><div><p className="section-eyebrow">Activité</p><h2 id="activity-title">Repères du portefeuille</h2></div></div>
        <MetricGrid role={role} stats={stats} averageScore={averageScore} />
      </section>

      {MANAGEMENT_ROLES.includes(role) && (
        <div className="grid-2 dashboard-support-grid">
          <section className="surface">
            <h2 className="surface-title">Qualité des dossiers</h2>
            <div className="dashboard-breakdown">
              <BreakdownRow icon={<CheckCircle size={18} />} tone="success" label="Préqualifiés" count={stats.prequalified} />
              <BreakdownRow icon={<AlertTriangle size={18} />} tone="warning" label="Revue requise" count={stats.reviewRequired} />
              <BreakdownRow icon={<Clock size={18} />} tone="neutral" label="Non évalués" count={dossiers.filter(d => !d.prequalification).length} />
            </div>
          </section>
          <section className="surface dashboard-guidance">
            <h2 className="surface-title">Lecture du score</h2>
            <p>Le score explique la solidité technique d'un dossier. L'éligibilité dépend aussi des règles bloquantes, des preuves, de la capacité de remboursement et des risques.</p>
            <Link to="/rules" className="btn btn-secondary btn-sm">Consulter les règles</Link>
          </section>
        </div>
      )}

      {role === 'AUDITEUR' && (
        <section className="surface dashboard-guidance">
          <h2 className="surface-title">Traçabilité des décisions</h2>
          <p>Consultez le journal append-only pour retracer les opérations et décisions.</p>
          <Link to="/audit" className="btn btn-primary"><BookOpen size={17} /> Ouvrir le journal d'audit</Link>
        </section>
      )}
    </div>
  );
}

function MetricGrid({ role, stats, averageScore }) {
  const metrics = role === 'AGENT'
    ? [[stats.draft, 'Brouillons à compléter', 'draft'], [stats.pending, "En cours d'instruction", 'submitted'], [stats.decided, 'Décisions reçues', 'decided']]
    : role === 'COMITE'
      ? [[stats.committee, 'Décisions attendues', 'committee'], [stats.decided, 'Décisions prises', 'decided'], [stats.prequalified, 'Dossiers préqualifiés', null]]
      : role === 'JURY'
        ? [[stats.total, 'Dossiers instruits', ''], [stats.prequalified, 'Préqualifiés', null], [stats.reviewRequired, 'Revues requises', null], [stats.decided, 'Décisions prises', 'decided']]
        : role === 'AUDITEUR'
          ? [[stats.total, 'Dossiers consultables', ''], [stats.decided, 'Décisions auditables', 'decided']]
          : [[stats.total, 'Total dossiers', ''], [averageScore == null ? '—' : `${averageScore}/100`, 'Score moyen', ''], [stats.pending, 'En instruction', 'submitted'], [stats.decided, 'Décidés', 'decided']];

  return <div className="metrics-row">{metrics.map(([value, label, status]) => {
    const target = status === null ? '/dossiers' : status ? `/dossiers?status=${status}` : '/dossiers';
    return (
      <Link key={label} to={target} className="metric-card metric-card-link">
        <span className="metric-value">{value}</span><span className="metric-label">{label}</span>
      </Link>
    );
  })}</div>;
}

function BreakdownRow({ icon, tone, label, count }) {
  return <div className={`dashboard-breakdown-row ${tone}`}><span className="dashboard-breakdown-icon">{icon}</span><span>{label}</span><strong>{count}</strong></div>;
}

function ActionList({ dossiers, loading, role }) {
  if (loading) return <div className="loading-state">Chargement des priorités…</div>;
  if (!dossiers.length) return (
    <div className="empty-state compact">
      <CheckCircle size={24} aria-hidden="true" />
      <div className="empty-state-title">Aucune action urgente</div>
      <div className="empty-state-desc">Aucun dossier ne nécessite votre intervention pour le moment.</div>
    </div>
  );

  return <div className="surface action-list">{dossiers.slice(0, 8).map(dossier => (
    <article className="action-list-item" key={dossier.id}>
      <span className="action-list-icon"><FileText size={18} /></span>
      <div className="action-list-main">
        <strong>{dossier.applicant_name || 'Demandeur non renseigné'}</strong>
        <span>{formatCFA(dossier.amount_requested)} · {dossier.applicant_location || dossier.activity_type || 'Localisation non renseignée'}</span>
      </div>
      <div className="action-list-status">
        <span className={`badge badge-${dossier.status === 'draft' ? 'neutral' : dossier.status === 'committee' ? 'warning' : 'info'}`}>{STATUS_LABELS[dossier.status] || dossier.status}</span>
        {dossier.prequalification && <span className={`badge badge-${prequalTone(dossier.prequalification)}`}>{prequalLabel(dossier.prequalification)}</span>}
      </div>
      <Link to={`/dossiers/${dossier.id}`} className="btn btn-secondary btn-sm">{role === 'COMITE' ? 'Examiner' : role === 'AGENT' ? 'Continuer' : 'Ouvrir'}</Link>
    </article>
  ))}</div>;
}

function prequalTone(value) {
  const color = prequalColor(value);
  return color === 'green' ? 'success' : color === 'amber' ? 'warning' : color === 'red' ? 'error' : 'neutral';
}