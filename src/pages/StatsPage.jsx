import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { STATUS_LABELS } from '../lib/format';

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStats().then(res => setStats(res)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">Chargement des statistiques...</div>;
  if (!stats) return <div className="empty-state"><div className="empty-state-title">Statistiques indisponibles</div></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Statistiques et indicateurs</h1>
        <p className="page-subtitle">Vue d'ensemble de l'activité — <span className="badge badge-neutral">DONNÉES DE DÉMONSTRATION</span></p>
      </div>

      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-value">{stats.total_dossiers ?? 0}</div>
          <div className="metric-label">Dossiers total</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.average_processing_days != null ? `${stats.average_processing_days} j` : '—'}</div>
          <div className="metric-label">Durée moyenne d'instruction</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.completion_rate != null ? `${stats.completion_rate}%` : '—'}</div>
          <div className="metric-label">Taux de complétion</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.override_rate != null ? `${stats.override_rate}%` : '—'}</div>
          <div className="metric-label">Taux d'override</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="surface">
          <div className="surface-title">Répartition par statut</div>
          {stats.dossiers_by_status && Object.keys(stats.dossiers_by_status).length > 0 ? (
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Statut</th><th style={{ textAlign: 'right' }}>Nombre</th></tr></thead>
                <tbody>
                  {Object.entries(stats.dossiers_by_status).map(([status, count]) => (
                    <tr key={status}>
                      <td>{STATUS_LABELS[status] || status}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune donnée disponible.</p>
          )}
        </div>

        <div className="surface">
          <div className="surface-title">Préqualification</div>
          {stats.prequalification_distribution && Object.keys(stats.prequalification_distribution).length > 0 ? (
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Résultat</th><th style={{ textAlign: 'right' }}>Nombre</th></tr></thead>
                <tbody>
                  {Object.entries(stats.prequalification_distribution).map(([key, count]) => (
                    <tr key={key}>
                      <td>
                        <span className={`badge ${key === 'PREQUALIFIE' ? 'badge-success' : key === 'REVUE_REQUISE' ? 'badge-warning' : key === 'NON_ELIGIBLE' ? 'badge-error' : 'badge-neutral'}`}>
                          {key === 'PREQUALIFIE' ? 'Préqualifié' : key === 'REVUE_REQUISE' ? 'Revue requise' : key === 'NON_ELIGIBLE' ? 'Non éligible' : key || 'Non évalué'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune donnée disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}
