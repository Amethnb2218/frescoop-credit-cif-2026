import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatCFA } from '../lib/format';
import { formatEligibleSectors } from '../lib/catalogDisplay';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import StatusBadge from '../components/ui/StatusBadge';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getProducts();
      setProducts(response.products || []);
    } catch (err) {
      setError(err.message || 'Impossible de charger les produits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue de financement"
        title="Produits de crédit"
        subtitle="Conditions et périmètres des produits disponibles pour votre institution."
      />

      <Panel className="table-panel">
        {loading ? <LoadingState message="Chargement des produits…" />
          : error ? <ErrorState title="Produits indisponibles" message={error} onRetry={loadProducts} />
            : products.length === 0 ? (
              <EmptyState
                title="Aucun produit configuré"
                description="Les produits de crédit seront configurés par l’administrateur de l’institution."
              />
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead><tr><th>Code</th><th>Nom</th><th>Montant min.</th><th>Montant max.</th><th>Durée</th><th>Secteurs éligibles</th><th>Statut</th></tr></thead>
                  <tbody>
                    {products.map(product => (
                      <tr key={product.id}>
                        <td className="table-cell-secondary"><span className="font-mono">{product.code}</span></td>
                        <td className="table-cell-primary">{product.name}</td>
                        <td className="table-cell-amount">{formatCFA(product.min_amount)}</td>
                        <td className="table-cell-amount">{formatCFA(product.max_amount)}</td>
                        <td>{product.min_duration}–{product.max_duration} mois</td>
                        <td>{formatEligibleSectors(product.eligible_sectors)}</td>
                        <td><StatusBadge tone={product.active ? 'success' : 'neutral'}>{product.active ? 'Actif' : 'Inactif'}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </Panel>
    </div>
  );
}
