import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCFA } from '../lib/format';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProducts().then(res => setProducts(res.products || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Produits de crédit</h1>
        <p className="page-subtitle">Configuration des produits disponibles pour cette IMF</p>
      </div>

      <div className="surface" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-state">Chargement des produits...</div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Aucun produit configuré</div>
            <div className="empty-state-desc">Les produits de crédit seront configurés par l'administrateur de l'IMF.</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Nom</th>
                  <th>Montant min</th>
                  <th>Montant max</th>
                  <th>Durée</th>
                  <th>Secteurs éligibles</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td><span className="font-mono">{p.code}</span></td>
                    <td className="table-cell-primary">{p.name}</td>
                    <td>{formatCFA(p.min_amount)}</td>
                    <td>{formatCFA(p.max_amount)}</td>
                    <td>{p.min_duration}–{p.max_duration} mois</td>
                    <td>{p.eligible_sectors || '—'}</td>
                    <td>
                      <span className={`badge ${p.active ? 'badge-success' : 'badge-neutral'}`}>
                        {p.active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
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
