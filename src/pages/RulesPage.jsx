import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';

export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getRules();
      setRules(response.rules || []);
    } catch (err) {
      setError(err.message || 'Impossible de charger les règles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  return (
    <div>
      <PageHeader
        eyebrow="Gouvernance du risque"
        title="Moteur de règles"
        subtitle="Calcul déterministe de la préqualification : règles, formules et seuils métier explicites."
      />

      <Panel title="Comment lire le résultat" className="mb-6">
        <div className="principles-grid">
          <div className="principle-item">
            <h3>Pas de modèle opaque</h3>
            <p>À données et version de règles identiques, FresCoop produit le même résultat. Chaque point et chaque alerte renvoient à un calcul identifiable.</p>
          </div>
          <div className="principle-item">
            <h3>Provisoire, puis définitif</h3>
            <p>Un dossier incomplet conserve un score provisoire et la liste des données manquantes. Le serveur recalcule après complétion.</p>
          </div>
          <div className="principle-item">
            <h3>Décision humaine</h3>
            <p>Teranga peut enrichir l’analyse, sans décider. Une indisponibilité n’entraîne ni pénalité ni refus automatique.</p>
          </div>
        </div>
      </Panel>

      <Panel className="table-panel">
        {loading ? <LoadingState message="Chargement des règles…" />
          : error ? <ErrorState title="Règles indisponibles" message={error} onRetry={loadRules} />
            : rules.length === 0 ? (
              <EmptyState title="Aucune règle publiée" description="Aucune règle active n’est disponible pour cette institution." />
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr><th>Code</th><th>Nom</th><th>Description</th><th>Résultat</th><th>Sévérité</th><th>Statut</th></tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => {
                      const resultTone = rule.result === 'NON_ELIGIBLE' ? 'danger'
                        : rule.result === 'REVUE_REQUISE' ? 'warning' : 'success';
                      const resultLabel = rule.result === 'NON_ELIGIBLE' ? 'Non éligible'
                        : rule.result === 'REVUE_REQUISE' ? 'Revue requise' : 'Préqualifié';
                      const severityTone = rule.severity === 'critical' ? 'danger'
                        : rule.severity === 'high' ? 'warning' : 'neutral';
                      return (
                        <tr key={rule.id}>
                          <td><span className="font-mono">{rule.code}</span></td>
                          <td className="table-cell-primary">{rule.name}</td>
                          <td className="table-description">{rule.description}</td>
                          <td><StatusBadge tone={resultTone}>{resultLabel}</StatusBadge></td>
                          <td><StatusBadge tone={severityTone}>{rule.severity}</StatusBadge></td>
                          <td><StatusBadge tone={rule.active ? 'success' : 'neutral'}>{rule.active ? 'Active' : 'Inactive'}</StatusBadge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </Panel>
    </div>
  );
}
