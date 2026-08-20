import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, formatDate, STATUS_LABELS, STATUS_COLORS, prequalLabel, prequalColor } from '../lib/format';
import { Plus, Search } from 'lucide-react';

export default function DossierList() {
  const [dossiers, setDossiers] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => { loadDossiers(); }, [statusFilter]);

  async function loadDossiers() {
    try {
      const res = await api.getDossiers(statusFilter || undefined);
      setDossiers(res.dossiers || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  const filtered = dossiers.filter(d => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (d.applicant_name || '').toLowerCase().includes(q) ||
           (d.applicant_location || '').toLowerCase().includes(q) ||
           (d.sector || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dossiers de crédit</h1>
        {(['AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'].includes(user?.role)) && (
          <Link to="/dossiers/new" className="btn btn-primary"><Plus size={16} /> Nouveau dossier</Link>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#9ca3af' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Rechercher un demandeur..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <select className="form-input form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Aucun dossier trouvé</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Demandeur</th>
                  <th>Localisation</th>
                  <th>Montant</th>
                  <th>Durée</th>
                  <th>Statut</th>
                  <th>Préqual.</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.applicant_name || 'Sans nom'}</strong><br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{d.activity_type || d.sector}</span></td>
                    <td style={{ fontSize: '0.85rem' }}>{d.applicant_location || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatCFA(d.amount_requested)}</td>
                    <td>{d.duration_months ? `${d.duration_months} mois` : '—'}</td>
                    <td><span className={`badge badge-${STATUS_COLORS[d.status]}`}>{STATUS_LABELS[d.status]}</span></td>
                    <td>{d.prequalification ? <span className={`badge badge-${prequalColor(d.prequalification)}`}>{prequalLabel(d.prequalification)}</span> : '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{formatDate(d.created_at)}</td>
                    <td><Link to={`/dossiers/${d.id}`} className="btn btn-sm btn-secondary">Ouvrir</Link></td>
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
