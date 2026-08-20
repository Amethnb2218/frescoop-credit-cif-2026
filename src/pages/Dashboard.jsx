import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, STATUS_LABELS, prequalLabel, prequalColor } from '../lib/format';
import { isOnline, getSyncQueue } from '../lib/offline';
import { FileText, Plus, Clock, AlertTriangle, CheckCircle, Wifi, WifiOff } from 'lucide-react';

export default function Dashboard() {
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const user = getUser();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      if (isOnline()) {
        const res = await api.getDossiers();
        setDossiers(res.dossiers || []);
      }
      const queue = await getSyncQueue();
      setPendingSync(queue.length);
    } catch {} finally {
      setLoading(false);
    }
  }

  const stats = {
    total: dossiers.length,
    draft: dossiers.filter(d => d.status === 'draft').length,
    pending: dossiers.filter(d => ['submitted', 'verification', 'review', 'committee'].includes(d.status)).length,
    decided: dossiers.filter(d => ['decided', 'exported', 'disbursed'].includes(d.status)).length,
    prequalified: dossiers.filter(d => d.prequalification === 'PREQUALIFIE').length,
    reviewRequired: dossiers.filter(d => d.prequalification === 'REVUE_REQUISE').length,
    nonEligible: dossiers.filter(d => d.prequalification === 'NON_ELIGIBLE').length,
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Tableau de bord</h1>
          <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
            {isOnline() ? <><Wifi size={14} style={{ color: '#38a169' }} /> Connecté</> : <><WifiOff size={14} style={{ color: '#d97706' }} /> Hors ligne</>}
            {pendingSync > 0 && <span style={{ marginLeft: 12, color: '#d97706' }}>{pendingSync} opération(s) en attente de sync</span>}
          </p>
        </div>
        {(user?.role === 'AGENT' || user?.role === 'SUPERVISEUR' || user?.role === 'ADMIN') && (
          <Link to="/dossiers/new" className="btn btn-primary"><Plus size={16} /> Nouveau dossier</Link>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Dossiers total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{stats.pending}</div>
          <div className="stat-label">En instruction</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#38a169' }}>{stats.decided}</div>
          <div className="stat-label">Décidés</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#6b7280' }}>{stats.draft}</div>
          <div className="stat-label">Brouillons</div>
        </div>
      </div>

      {(user?.role === 'COMITE' || user?.role === 'SUPERVISEUR' || user?.role === 'ADMIN') && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h2 className="card-title">Préqualification des dossiers actifs</h2>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={20} color="#38a169" />
              <span><strong>{stats.prequalified}</strong> Préqualifié(s)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} color="#d97706" />
              <span><strong>{stats.reviewRequired}</strong> Revue requise</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} color="#dc2626" />
              <span><strong>{stats.nonEligible}</strong> Non éligible(s)</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Dossiers récents</h2>
          <Link to="/dossiers" className="btn btn-sm btn-secondary">Voir tout</Link>
        </div>
        {loading ? (
          <p style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>Chargement...</p>
        ) : dossiers.length === 0 ? (
          <p style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>Aucun dossier</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Demandeur</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Préqualification</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dossiers.slice(0, 10).map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.applicant_name || 'Sans nom'}</strong><br /><span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{d.applicant_location}</span></td>
                    <td>{formatCFA(d.amount_requested)}</td>
                    <td><span className={`badge badge-${d.status === 'draft' ? 'gray' : ['decided','exported','disbursed'].includes(d.status) ? 'green' : 'amber'}`}>{STATUS_LABELS[d.status]}</span></td>
                    <td>{d.prequalification ? <span className={`badge badge-${prequalColor(d.prequalification)}`}>{prequalLabel(d.prequalification)}</span> : '—'}</td>
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
