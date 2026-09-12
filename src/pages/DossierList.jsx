import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { api, getUser } from '../lib/api';
import {
  formatCFA, formatDate, getMissingScoreData, isProvisionalScore, isScoreAvailable,
  prequalColor, prequalLabel, STATUS_LABELS,
} from '../lib/format';
import { ScoreBadge, StatusBadge } from '../components/ui';

const CAN_CREATE = ['AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'];
const DECISION_QUEUE_FILTER = 'decisions';
const DECISION_QUEUE_STATUSES = new Set(['committee_ready', 'committee']);

export default function DossierList() {
  const [dossiers, setDossiers] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const user = getUser();

  useEffect(() => { setStatusFilter(searchParams.get('status') || ''); }, [searchParams]);
  useEffect(() => { loadDossiers(); }, [statusFilter]);

  async function loadDossiers() {
    setLoading(true);
    setError('');
    try {
      const requestStatus = statusFilter === DECISION_QUEUE_FILTER ? undefined : statusFilter || undefined;
      const res = await api.getDossiers(requestStatus);
      setDossiers(res.dossiers || []);
    } catch (err) {
      setError(err.message || 'Les dossiers sont indisponibles.');
    } finally {
      setLoading(false);
    }
  }

  function changeStatus(value) {
    setStatusFilter(value);
    setSearchParams(value ? { status: value } : {});
  }

  const filtered = dossiers.filter(dossier => {
    if (statusFilter === DECISION_QUEUE_FILTER && !DECISION_QUEUE_STATUSES.has(dossier.status)) return false;
    if (!filter.trim()) return true;
    const query = filter.trim().toLocaleLowerCase('fr');
    return [dossier.applicant_name, dossier.applicant_location, dossier.sector, dossier.applicant_id_number]
      .some(value => String(value || '').toLocaleLowerCase('fr').includes(query));
  });

  return (
    <div className="dossier-list-page">
      <header className="page-header page-header-row">
        <div><h1 className="page-title">Dossiers de crédit</h1><p className="page-subtitle">{filtered.length} dossier{filtered.length !== 1 ? 's' : ''} affiché{filtered.length !== 1 ? 's' : ''}</p></div>
        {CAN_CREATE.includes(user?.role) && <Link to="/dossiers/new" className="btn btn-primary"><Plus size={17} /> Nouveau dossier</Link>}
      </header>

      <section className="surface dossier-filters" aria-label="Filtres des dossiers">
        <label className="search-field" htmlFor="dossier-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Rechercher</span><input id="dossier-search" className="input" placeholder="Nom, localisation, secteur ou pièce d'identité" value={filter} onChange={event => setFilter(event.target.value)} /></label>
        <label className="filter-field" htmlFor="dossier-status"><span>Statut</span><select id="dossier-status" className="input" value={statusFilter} onChange={event => changeStatus(event.target.value)}><option value="">Tous les statuts</option><option value={DECISION_QUEUE_FILTER}>Décisions à traiter</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </section>

      {error && <div className="alert alert-danger" role="alert"><AlertTriangle size={18} /><div><strong>Chargement impossible</strong><p>{error}</p><button className="btn btn-secondary btn-sm" onClick={loadDossiers}>Réessayer</button></div></div>}

      <section className="surface dossier-results">
        {loading ? <div className="loading-state">Chargement des dossiers…</div> : !error && filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-title">Aucun dossier trouvé</div><div className="empty-state-desc">{filter || statusFilter ? 'Modifiez vos critères pour élargir la recherche.' : 'Créez un nouveau dossier pour commencer.'}</div></div>
        ) : !error ? <DossierResults dossiers={filtered} user={user} /> : null}
      </section>
    </div>
  );
}

function DossierResults({ dossiers, user }) {
  return <>
    <div className="table-container dossier-table-desktop"><table className="data-table"><thead><tr><th>Demandeur</th><th>Montant</th><th>Score</th><th>Statut</th><th>Préqualification</th><th>Mise à jour</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {dossiers.map(dossier => <tr key={dossier.id}><td><div className="table-cell-primary">{dossier.applicant_name || 'Non renseigné'}</div><div className="table-cell-secondary">{dossier.applicant_location || '—'}{dossier.activity_type ? ` · ${dossier.activity_type}` : ''}</div></td><td className="table-cell-amount">{formatCFA(dossier.amount_requested)}</td><td><ScoreSummary dossier={dossier} /></td><td><StatusBadge status={dossier.status} /></td><td><PrequalificationBadge value={dossier.prequalification} /></td><td><span className="text-xs text-muted">{formatDate(dossier.updated_at || dossier.created_at)}</span></td><td><DossierActions dossier={dossier} user={user} /></td></tr>)}
    </tbody></table></div>
    <div className="dossier-cards-mobile">{dossiers.map(dossier => <DossierCard key={dossier.id} dossier={dossier} user={user} />)}</div>
  </>;
}

function DossierCard({ dossier, user }) {
  return <article className="dossier-list-card"><div className="dossier-list-card-header"><div><h2>{dossier.applicant_name || 'Demandeur non renseigné'}</h2><p>{dossier.applicant_location || dossier.activity_type || 'Localisation non renseignée'}</p></div><ScoreBadge score={dossier.prequalification_score} details={dossier.prequalification_score_details} /></div><div className="dossier-list-card-amount"><span>Montant demandé</span><strong>{formatCFA(dossier.amount_requested)}</strong></div><div className="dossier-list-card-badges"><StatusBadge status={dossier.status} /><PrequalificationBadge value={dossier.prequalification} /></div><ScoreDetails dossier={dossier} compact /><div className="dossier-list-card-footer"><span>Mis à jour le {formatDate(dossier.updated_at || dossier.created_at)}</span><DossierActions dossier={dossier} user={user} /></div></article>;
}

function DossierActions({ dossier, user }) {
  return <div className="dossier-row-actions">{user?.role === 'AGENT' && ['draft', 'incomplete'].includes(dossier.status) && <Link to={`/dossiers/${dossier.id}/edit`} className="btn btn-primary btn-sm">Modifier</Link>}<Link to={`/dossiers/${dossier.id}`} className="btn btn-secondary btn-sm">Ouvrir</Link></div>;
}

function ScoreSummary({ dossier }) {
  return <div className="score-summary"><ScoreBadge score={dossier.prequalification_score} details={dossier.prequalification_score_details} /><ScoreDetails dossier={dossier} /></div>;
}

function ScoreDetails({ dossier, compact = false }) {
  const available = isScoreAvailable(dossier.prequalification_score);
  const provisional = isProvisionalScore(dossier.prequalification_score_details);
  const missing = getMissingScoreData(dossier.prequalification_score_details);
  const description = missing.length ? `Données à compléter : ${missing.map(item => item.label).join(', ')}` : '';

  if (!available && !missing.length) return <span className="text-xs text-muted">Non calculé — données insuffisantes</span>;
  return <div className={`score-details ${compact ? 'compact' : ''}`}>{available && <strong>{provisional ? 'Score provisoire' : 'Score définitif'}</strong>}{missing.length > 0 && <span title={description} aria-label={description}><b>À compléter :</b> {missing.slice(0, compact ? 1 : 2).map(item => item.label).join(', ')}{missing.length > (compact ? 1 : 2) ? ` +${missing.length - (compact ? 1 : 2)}` : ''}</span>}</div>;
}

function PrequalificationBadge({ value }) {
  if (!value) return <span className="text-xs text-muted">Non évalué</span>;
  const color = prequalColor(value);
  const tone = color === 'green' ? 'success' : color === 'amber' ? 'warning' : color === 'red' ? 'error' : 'neutral';
  return <span className={`badge badge-${tone}`}>{prequalLabel(value)}</span>;
}