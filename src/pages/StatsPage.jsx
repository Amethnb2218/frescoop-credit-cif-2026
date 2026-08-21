import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { STATUS_LABELS, formatCFA } from '../lib/format';

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getStats();
        if (res && (res.total_dossiers != null || res.dossiers_by_status)) {
          setStats(res);
        } else {
          throw new Error('empty');
        }
      } catch {
        try {
          const res = await api.getDossiers();
          const dossiers = res.dossiers || [];
          const byStatus = {};
          const byPrequal = {};
          let totalAmount = 0;
          let decidedCount = 0;

          dossiers.forEach(d => {
            byStatus[d.status] = (byStatus[d.status] || 0) + 1;
            if (d.prequalification) byPrequal[d.prequalification] = (byPrequal[d.prequalification] || 0) + 1;
            else byPrequal['non_evalue'] = (byPrequal['non_evalue'] || 0) + 1;
            totalAmount += d.amount_requested || 0;
            if (['decided', 'exported', 'disbursed'].includes(d.status)) decidedCount++;
          });

          setStats({
            total_dossiers: dossiers.length,
            total_amount: totalAmount,
            average_amount: dossiers.length > 0 ? Math.round(totalAmount / dossiers.length) : 0,
            completion_rate: dossiers.length > 0 ? Math.round((decidedCount / dossiers.length) * 100) : 0,
            dossiers_by_status: byStatus,
            prequalification_distribution: byPrequal,
          });
        } catch { }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading-state">Chargement des statistiques...</div>;
  if (!stats) return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Statistiques et indicateurs</h1>
      </div>
      <div className="surface" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ fontSize: 'var(--fs-md)', color: 'var(--c-text-secondary)' }}>Aucun dossier dans le système pour le moment.</p>
        <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', marginTop: 8 }}>Les statistiques apparaîtront dès qu'il y aura des dossiers enregistrés.</p>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Statistiques et indicateurs</h1>
        <p className="page-subtitle">Vue d'ensemble de l'activité</p>
      </div>

      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-value">{stats.total_dossiers ?? 0}</div>
          <div className="metric-label">Dossiers total</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.total_amount ? formatCFA(stats.total_amount) : '—'}</div>
          <div className="metric-label">Volume total demandé</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.completion_rate != null ? `${stats.completion_rate}%` : '—'}</div>
          <div className="metric-label">Taux de complétion</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.average_amount ? formatCFA(stats.average_amount) : '—'}</div>
          <div className="metric-label">Montant moyen</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="surface">
          <div className="surface-title">Répartition par statut</div>
          {stats.dossiers_by_status && Object.keys(stats.dossiers_by_status).length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {Object.entries(stats.dossiers_by_status).map(([status, count]) => {
                const total = stats.total_dossiers || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 'var(--fs-12)', fontWeight: 500 }}>{STATUS_LABELS[status] || status}</span>
                        <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600 }}>{count}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--c-100)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--c-primary)', borderRadius: 3, transition: 'width .3s' }}></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune donnée disponible.</p>
          )}
        </div>

        <div className="surface">
          <div className="surface-title">Préqualification</div>
          {stats.prequalification_distribution && Object.keys(stats.prequalification_distribution).length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {Object.entries(stats.prequalification_distribution).map(([key, count]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: key === 'PREQUALIFIE' ? '#ecfdf5' : key === 'REVUE_REQUISE' ? '#fffbeb' : key === 'NON_ELIGIBLE' ? '#fef2f2' : '#f9fafb', borderRadius: 'var(--radius)', border: '1px solid var(--c-border-light)' }}>
                  <span style={{ fontSize: 'var(--fs-12)', fontWeight: 500 }}>
                    {key === 'PREQUALIFIE' ? 'Préqualifié' : key === 'REVUE_REQUISE' ? 'Revue requise' : key === 'NON_ELIGIBLE' ? 'Non éligible' : 'Non évalué'}
                  </span>
                  <span style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: key === 'PREQUALIFIE' ? 'var(--c-success)' : key === 'NON_ELIGIBLE' ? 'var(--c-error)' : 'var(--c-text)' }}>{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune donnée disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}
