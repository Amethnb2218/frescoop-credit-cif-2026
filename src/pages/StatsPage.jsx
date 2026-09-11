import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';
import { STATUS_LABELS, formatCFA, prequalLabel } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Alert from '../components/ui/Alert';
import Metric from '../components/ui/Metric';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';

const PREQUAL_COLORS = {
  PREQUALIFIE: '#1b6b52',
  REVUE_REQUISE: '#a0650a',
  NON_ELIGIBLE: '#c13030',
  non_evalue: '#8b95a5',
};

function summarizeDossiers(dossiers) {
  const byStatus = {};
  const byPrequal = {};
  let totalAmount = 0;
  let decidedCount = 0;
  dossiers.forEach(dossier => {
    byStatus[dossier.status] = (byStatus[dossier.status] || 0) + 1;
    const prequalification = dossier.prequalification || 'non_evalue';
    byPrequal[prequalification] = (byPrequal[prequalification] || 0) + 1;
    totalAmount += Number(dossier.amount_requested || 0);
    if (['decided', 'exported', 'disbursed'].includes(dossier.status)) decidedCount += 1;
  });
  return {
    total_dossiers: dossiers.length,
    total_amount: totalAmount,
    average_amount: dossiers.length ? Math.round(totalAmount / dossiers.length) : 0,
    completion_rate: dossiers.length ? Math.round((decidedCount / dossiers.length) * 100) : 0,
    dossiers_by_status: byStatus,
    prequalification_distribution: byPrequal,
  };
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('stats');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    setSource('stats');
    try {
      const response = await api.getStats();
      if (!response || (response.total_dossiers == null && !response.dossiers_by_status)) throw new Error('Réponse statistique incomplète');
      setStats(response);
    } catch (statsError) {
      try {
        const response = await api.getDossiers();
        setStats(summarizeDossiers(response.dossiers || []));
        setSource('dossiers');
      } catch (dossiersError) {
        setStats(null);
        setError(dossiersError.message || statsError.message || 'Impossible de charger les indicateurs.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) return <LoadingState message="Calcul des indicateurs…" />;

  const statusData = Object.entries(stats?.dossiers_by_status || {}).map(([key, value]) => ({ key, name: STATUS_LABELS[key] || key, count: value }));
  const prequalificationData = Object.entries(stats?.prequalification_distribution || {}).map(([key, value]) => ({ key, name: key === 'non_evalue' ? 'Non évalué' : prequalLabel(key), value }));

  return (
    <div className="viz-root">
      <PageHeader eyebrow="Pilotage du portefeuille" title="Statistiques et indicateurs" subtitle="Vue consolidée des demandes, orientations techniques et montants sollicités." />

      {error && <ErrorState title="Indicateurs indisponibles" message={error} onRetry={loadStats} />}
      {source === 'dossiers' && (
        <Alert tone="warning" title="Synthèse recalculée">
          Le service statistique est indisponible. Ces indicateurs sont recalculés à partir de la liste des dossiers accessibles.
        </Alert>
      )}

      {!stats ? null : stats.total_dossiers === 0 ? (
        <Panel><EmptyState title="Aucun dossier enregistré" description="Les indicateurs apparaîtront dès qu’un dossier sera créé." /></Panel>
      ) : (
        <>
          <div className="metrics-row">
            <Metric label="Dossiers" value={stats.total_dossiers ?? 0} />
            <Metric label="Volume total demandé" value={stats.total_amount != null ? formatCFA(stats.total_amount) : '—'} />
            <Metric label="Taux de complétion" value={stats.completion_rate != null ? `${stats.completion_rate} %` : '—'} />
            <Metric label="Montant moyen" value={stats.average_amount != null ? formatCFA(stats.average_amount) : '—'} />
          </div>

          <div className="grid-2 chart-grid">
            <Panel title="Répartition par statut">
              {statusData.length ? (
                <figure className="chart-figure" aria-labelledby="status-chart-title">
                  <figcaption id="status-chart-title" className="sr-only">Nombre de dossiers pour chaque statut</figcaption>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={statusData} margin={{ top: 8, right: 8, left: -12, bottom: 48 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5a6577' }} interval={0} angle={-24} textAnchor="end" height={68} />
                      <YAxis tick={{ fontSize: 11, fill: '#5a6577' }} allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f2f1ec' }} formatter={value => [value, 'Dossiers']} />
                      <Bar dataKey="count" fill="#1b6b52" radius={[4, 4, 0, 0]} name="Dossiers" />
                    </BarChart>
                  </ResponsiveContainer>
                </figure>
              ) : <EmptyState title="Aucun statut disponible" />}
            </Panel>

            <Panel title="Orientations de préqualification">
              {prequalificationData.length ? (
                <div className="pie-layout">
                  <figure className="chart-figure" aria-labelledby="prequal-chart-title">
                    <figcaption id="prequal-chart-title" className="sr-only">Répartition des orientations de préqualification</figcaption>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={prequalificationData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" paddingAngle={2} stroke="#fff" strokeWidth={2}>
                          {prequalificationData.map(item => <Cell key={item.key} fill={PREQUAL_COLORS[item.key] || PREQUAL_COLORS.non_evalue} />)}
                        </Pie>
                        <Tooltip formatter={(value, _name, item) => [value, item.payload.name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </figure>
                  <ul className="chart-legend">
                    {prequalificationData.map(item => (
                      <li key={item.key}><span className="legend-mark" style={{ '--legend-color': PREQUAL_COLORS[item.key] || PREQUAL_COLORS.non_evalue }} aria-hidden="true" /><span>{item.name}</span><strong>{item.value}</strong></li>
                    ))}
                  </ul>
                </div>
              ) : <EmptyState title="Aucune orientation disponible" />}
            </Panel>
          </div>

          <Panel title="Lecture détaillée" className="chart-table-panel">
            <div className="grid-2">
              <div><h3>Statuts des dossiers</h3><ul className="summary-list">{statusData.map(item => <li key={item.key}><span>{item.name}</span><strong>{item.count}</strong></li>)}</ul></div>
              <div><h3>Préqualification</h3><ul className="summary-list">{prequalificationData.map(item => <li key={item.key}><span>{item.name}</span><strong>{item.value}</strong></li>)}</ul></div>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
