import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, formatDate, STATUS_LABELS, prequalLabel, prequalColor } from '../lib/format';
import { Plus, Search, Filter } from 'lucide-react';

export default function DossierList() {
  const [dossiers, setDossiers] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const user = getUser();

  useEffect(() => {
    const s = searchParams.get('status') || '';
    setStatusFilter(s);
  }, [searchParams]);

  useEffect(() => { loadDossiers(); }, [statusFilter]);

  async function loadDossiers() {
    try {
      const res = await api.getDossiers(statusFilter || undefined);
      setDossiers(res.dossiers || []);
    } catch {} finally { setLoading(false); }
  }

  const filtered = dossiers.filter(d => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (d.applicant_name || '').toLowerCase().includes(q) ||
           (d.applicant_location || '').toLowerCase().includes(q) ||
           (d.sector || '').toLowerCase().includes(q) ||
           (d.applicant_id_number || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="page-title">Dossiers de crédit</h1>
            <p className="page-subtitle">{filtered.length} dossier{filtered.length > 1 ? 's' : ''}</p>
          </div>
          {['AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'].includes(user?.role) && (
            <Link to="/dossiers/new" className="btn btn-primary"><Plus size={16} /> Nouveau dossier</Link>
          )}
        </div>
      </div>

      <div className="surface" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--c-400)' }} />
            <input className="input" style={{ paddingLeft: 32 }} placeholder="Rechercher par nom, localisation..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <select className="input" style={{ width: 'auto', minWidth: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="surface" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-state">Chargement des dossiers...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Aucun dossier trouvé</div>
            <div className="empty-state-desc">
              {filter ? 'Modifiez vos critères de recherche.' : 'Créez un nouveau dossier pour commencer.'}
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Demandeur</th>
                  <th>Montant</th>
                  <th>Score</th>
                  <th>Statut</th>
                  <th>Préqualification</th>
                  <th>Dernière mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td>
                      <div className="table-cell-primary">{d.applicant_name || 'Non renseigné'}</div>
                      <div className="table-cell-secondary">{d.applicant_location || '—'} {d.activity_type ? `· ${d.activity_type}` : ''}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatCFA(d.amount_requested)}</td>
                    <td>
                      {d.prequalification_score != null ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: d.prequalification_score > 70 ? '#ecfdf5' : d.prequalification_score >= 40 ? '#fffbeb' : '#fef2f2', border: `2px solid ${d.prequalification_score > 70 ? '#059669' : d.prequalification_score >= 40 ? '#d97706' : '#dc2626'}`, fontSize: 11, fontWeight: 700, color: d.prequalification_score > 70 ? '#059669' : d.prequalification_score >= 40 ? '#d97706' : '#dc2626' }}>
                          {d.prequalification_score}
                        </span>
                      ) : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${d.status === 'draft' ? 'neutral' : ['decided','exported','disbursed','closed'].includes(d.status) ? 'success' : 'warning'}`}>
                        {STATUS_LABELS[d.status]}
                      </span>
                    </td>
                    <td>
                      {d.prequalification ? (
                        <span className={`badge badge-${prequalColor(d.prequalification) === 'green' ? 'success' : prequalColor(d.prequalification) === 'amber' ? 'warning' : 'error'}`}>
                          {prequalLabel(d.prequalification)}
                        </span>
                      ) : <span className="text-xs text-muted">Non évalué</span>}
                    </td>
                    <td><span className="text-xs text-muted">{formatDate(d.updated_at || d.created_at)}</span></td>
                    <td><Link to={`/dossiers/${d.id}`} className="btn btn-secondary btn-sm">Ouvrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
