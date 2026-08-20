import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { isOnline, getSyncQueue, onConnectivityChange } from '../lib/offline';
import { RefreshCw, Wifi, WifiOff, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

export default function SyncPage() {
  const [online, setOnline] = useState(isOnline());
  const [serverStatus, setServerStatus] = useState(null);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
    return onConnectivityChange(setOnline);
  }, []);

  async function loadStatus() {
    try {
      const q = await getSyncQueue();
      setQueue(q);
      if (isOnline()) {
        const res = await api.syncStatus();
        setServerStatus(res);
      }
    } catch {} finally { setLoading(false); }
  }

  async function handleSync() {
    if (!isOnline() || queue.length === 0) return;
    setSyncing(true);
    setLastResult(null);
    try {
      const operations = queue.map(op => ({
        operation: op.operation,
        entity_type: op.entity_type,
        entity_id: op.entity_id,
        payload: op.payload,
        local_timestamp: op.local_timestamp,
      }));
      const res = await api.syncPush(operations);
      setLastResult(res);
      await loadStatus();
    } catch (err) {
      setLastResult({ error: err.message });
    } finally { setSyncing(false); }
  }

  if (loading) return <div className="loading-state">Chargement...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Synchronisation</h1>
        <p className="page-subtitle">État de la synchronisation entre cet appareil et le serveur</p>
      </div>

      <div className="surface mb-6">
        <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
          {online ? (
            <>
              <Wifi size={18} color="var(--c-success)" />
              <div>
                <div className="font-semibold">Connecté au réseau</div>
                <div className="text-xs text-muted">La synchronisation est disponible.</div>
              </div>
            </>
          ) : (
            <>
              <WifiOff size={18} color="var(--c-warning)" />
              <div>
                <div className="font-semibold" style={{ color: 'var(--c-warning)' }}>Hors connexion</div>
                <div className="text-xs text-muted">Votre travail est enregistré sur cet appareil. La synchronisation reprendra au retour du réseau.</div>
              </div>
            </>
          )}
        </div>

        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-value" style={{ color: queue.length > 0 ? 'var(--c-warning)' : 'var(--c-success)' }}>{queue.length}</div>
            <div className="metric-label">Opérations en attente</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{serverStatus?.failed ?? 0}</div>
            <div className="metric-label">Échecs côté serveur</div>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="flex items-center gap-2" style={{ color: 'var(--c-success)' }}>
            <CheckCircle size={16} />
            <span className="text-sm font-semibold">Toutes les données sont synchronisées.</span>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing || !online}>
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            {syncing ? 'Synchronisation en cours...' : 'Synchroniser maintenant'}
          </button>
        )}

        {lastResult && !lastResult.error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--c-success-bg)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-12)' }}>
            Synchronisation terminée : {lastResult.results?.filter(r => r.status === 'synced').length ?? 0} opération(s) envoyée(s).
          </div>
        )}
        {lastResult?.error && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--c-danger-bg)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-12)', color: 'var(--c-danger)' }}>
            La synchronisation a échoué : {lastResult.error}. Vos données restent enregistrées sur cet appareil.
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="surface">
          <div className="surface-title">Opérations en attente</div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Opération</th>
                  <th>Entité</th>
                  <th>Date locale</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(op => (
                  <tr key={op.id}>
                    <td>{op.entity_type}</td>
                    <td><span className="badge badge-neutral">{op.operation}</span></td>
                    <td className="font-mono text-xs">{op.entity_id?.slice(0, 8)}...</td>
                    <td className="text-xs text-muted">{op.local_timestamp}</td>
                    <td>
                      <span className="badge badge-warning"><Clock size={10} /> En attente</span>
                    </td>
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
