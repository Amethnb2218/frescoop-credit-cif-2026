import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRules().then(res => setRules(res.rules || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Moteur de règles</h1>
        <p className="page-subtitle">Calcul déterministe de la préqualification : règles, formules et seuils métier explicites</p>
      </div>

      <div className="surface mb-6">
        <div className="surface-title">Comment lire le résultat</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          <div>
            <div className="font-semibold" style={{ marginBottom: 4 }}>Pas de modèle opaque</div>
            <p className="text-sm text-muted">À données et version de règles identiques, FresCoop produit le même résultat. Chaque point et chaque alerte renvoient à un calcul ou à un seuil identifiable.</p>
          </div>
          <div>
            <div className="font-semibold" style={{ marginBottom: 4 }}>Provisoire, puis définitif</div>
            <p className="text-sm text-muted">Un dossier incomplet conserve un score provisoire et la liste des données manquantes. Après complétion, un recalcul serveur établit le score définitif.</p>
          </div>
          <div>
            <div className="font-semibold" style={{ marginBottom: 4 }}>Décision humaine</div>
            <p className="text-sm text-muted">Teranga peut enrichir rendement, risque et conseil. Il ne décide jamais seul ; une indisponibilité n'entraîne ni pénalité ni refus automatique.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Chargement des règles...</div>
      ) : (
        <div className="surface" style={{ padding: 0 }}>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Nom</th>
                  <th>Description</th>
                  <th>Résultat</th>
                  <th>Sévérité</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td><span className="font-mono">{r.code}</span></td>
                    <td className="table-cell-primary">{r.name}</td>
                    <td style={{ maxWidth: 300 }}>{r.description}</td>
                    <td>
                      <span className={`badge ${r.result === 'NON_ELIGIBLE' ? 'badge-error' : r.result === 'REVUE_REQUISE' ? 'badge-warning' : 'badge-success'}`}>
                        {r.result === 'NON_ELIGIBLE' ? 'Non éligible' : r.result === 'REVUE_REQUISE' ? 'Revue requise' : 'Préqualifié'}
                      </span>
                    </td>
                    <td><span className={`badge ${r.severity === 'critical' ? 'badge-error' : r.severity === 'high' ? 'badge-warning' : 'badge-neutral'}`}>{r.severity}</span></td>
                    <td>{r.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
