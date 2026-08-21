import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { STATUS_LABELS, formatCFA } from '../lib/format';
import { BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';

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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={Object.entries(stats.dossiers_by_status).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, count: v }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#1b6b52" radius={[3, 3, 0, 0]} name="Dossiers" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Aucune donnée disponible.</p>
          )}
        </div>

        <div className="surface">
          <div className="surface-title">Préqualification</div>
          {stats.prequalification_distribution && Object.keys(stats.prequalification_distribution).length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={Object.entries(stats.prequalification_distribution).map(([k, v]) => ({ name: k === 'PREQUALIFIE' ? 'Préqualifié' : k === 'REVUE_REQUISE' ? 'Revue requise' : k === 'NON_ELIGIBLE' ? 'Non éligible' : 'Non évalué', value: v }))} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {Object.keys(stats.prequalification_distribution).map((k, i) => (
                      <Cell key={i} fill={k === 'PREQUALIFIE' ? '#059669' : k === 'REVUE_REQUISE' ? '#d97706' : k === 'NON_ELIGIBLE' ? '#dc2626' : '#9ca3af'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(stats.prequalification_distribution).map(([key, count]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-12)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: key === 'PREQUALIFIE' ? '#059669' : key === 'REVUE_REQUISE' ? '#d97706' : key === 'NON_ELIGIBLE' ? '#dc2626' : '#9ca3af' }}></span>
                    <span>{key === 'PREQUALIFIE' ? 'Préqualifié' : key === 'REVUE_REQUISE' ? 'Revue requise' : key === 'NON_ELIGIBLE' ? 'Non éligible' : 'Non évalué'}</span>
                    <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune donnée disponible.</p>
          )}
        </div>
      </div>
    </div>
  );
}
