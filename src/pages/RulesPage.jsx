import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Scale, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function RulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRules().then(res => setRules(res.rules || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const severityColor = { low: '#6b7280', medium: '#d97706', high: '#dc2626', critical: '#7c2d12' };
  const resultIcon = { PREQUALIFIE: <CheckCircle size={16} color="#38a169" />, REVUE_REQUISE: <AlertTriangle size={16} color="#d97706" />, NON_ELIGIBLE: <XCircle size={16} color="#dc2626" /> };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 24 }}>Moteur de règles</h1>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: '0.85rem' }}>
        Ces règles définissent les conditions de préqualification. Chaque règle produit un résultat explicable.
      </p>

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement...</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rules.map(r => (
            <div key={r.id} className="card" style={{ padding: 16, borderLeft: `4px solid ${severityColor[r.severity] || '#6b7280'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {resultIcon[r.result]}
                    <strong style={{ fontSize: '0.9rem' }}>{r.code}</strong>
                    <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>— {r.name}</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: 6 }}>{r.description}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <span className={`badge ${r.result === 'NON_ELIGIBLE' ? 'badge-red' : r.result === 'REVUE_REQUISE' ? 'badge-amber' : 'badge-green'}`}>
                    {r.result === 'NON_ELIGIBLE' ? 'Non éligible' : r.result === 'REVUE_REQUISE' ? 'Revue requise' : 'Préqualifié'}
                  </span>
                  <span className="badge badge-gray">{r.severity}</span>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#9ca3af' }}>
                Condition: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{r.condition_expr}</code>
                {' '}— Version {r.version} — {r.active ? 'Active' : 'Inactive'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
