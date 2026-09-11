import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Clock, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { api } from '../lib/api';
import { isOnline, getSyncQueue, markSynced, onConnectivityChange } from '../lib/offline';
import { formatDateTime } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Alert from '../components/ui/Alert';
import Metric from '../components/ui/Metric';
import StatusBadge from '../components/ui/StatusBadge';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';

export default function SyncPage() {
  const [online, setOnline] = useState(isOnline());
  const [serverStatus, setServerStatus] = useState(null);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastAttempt, setLastAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const localQueue = await getSyncQueue();
      setQueue(localQueue);
      if (isOnline()) setServerStatus(await api.syncStatus());
      else setServerStatus(null);
    } catch (err) {
      setError(err.message || 'Impossible de lire l’état de synchronisation.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return onConnectivityChange(nextOnline => {
      setOnline(nextOnline);
      if (nextOnline) loadStatus();
    });
  }, [loadStatus]);

  async function handleSync() {
    if (!isOnline() || queue.length === 0 || syncing) return;
    setSyncing(true);
    setLastResult(null);
    setLastAttempt(new Date().toISOString());
    try {
      const operations = queue.map(operation => ({
        operation: operation.operation,
        entity_type: operation.entity_type,
        entity_id: operation.entity_id,
        payload: operation.payload,
        local_timestamp: operation.local_timestamp,
      }));
      const response = await api.syncPush(operations);
      const completed = new Map((response.results || []).map(result => [
        `${result.entity_id}:${result.local_timestamp}`, result.status,
      ]));
      await Promise.all(queue.map(operation => {
        const status = completed.get(`${operation.entity_id}:${operation.local_timestamp}`);
        return ['synced', 'duplicate'].includes(status) ? markSynced(operation.id) : Promise.resolve();
      }));
      setLastResult(response);
      await loadStatus();
    } catch (err) {
      setLastResult({ error: err.message || 'Erreur de synchronisation' });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <LoadingState message="Lecture de la file de synchronisation…" />;

  const failedResults = (lastResult?.results || []).filter(result => !['synced', 'duplicate'].includes(result.status));

  return (
    <div>
      <PageHeader eyebrow="Continuité opérationnelle" title="Synchronisation" subtitle="Suivi des données conservées sur cet appareil et transmises au serveur." />

      {error && <ErrorState title="État indisponible" message={error} onRetry={loadStatus} />}

      <Panel title="Continuité des données" className="mb-6">
        <ol className="process-list">
          <li><span>1</span><div><strong>Saisie locale</strong><p>Le brouillon reste enregistré sur cet appareil, même hors connexion.</p></div></li>
          <li><span>2</span><div><strong>Transmission sans doublon</strong><p>Les opérations en attente sont envoyées au retour du réseau.</p></div></li>
          <li><span>3</span><div><strong>Recalcul serveur</strong><p>L’analyse et le score sont recalculés avec les données synchronisées.</p></div></li>
        </ol>
      </Panel>

      <Panel
        title="État de cet appareil"
        action={<StatusBadge tone={online ? 'success' : 'warning'}>{online ? 'En ligne' : 'Hors connexion'}</StatusBadge>}
        className="mb-6"
      >
        <div className="connectivity-summary">
          {online ? <Wifi size={20} aria-hidden="true" /> : <WifiOff size={20} aria-hidden="true" />}
          <div>
            <strong>{online ? 'Connexion disponible' : 'Travail local protégé'}</strong>
            <p>{online ? 'La synchronisation peut être lancée.' : 'Les données restent sur cet appareil et seront transmises au retour du réseau.'}</p>
          </div>
        </div>

        <div className="metrics-row">
          <Metric label="Opérations en attente" value={queue.length} tone={queue.length ? 'warning' : 'success'} />
          <Metric label="Échecs signalés par le serveur" value={serverStatus?.failed ?? '—'} />
          <Metric label="Dernière tentative" value={lastAttempt ? formatDateTime(lastAttempt) : 'Aucune'} compact />
        </div>

        {queue.length === 0 ? (
          <Alert tone="success" title="Données synchronisées" icon={CheckCircle}>Aucune opération locale n’est en attente.</Alert>
        ) : (
          <div className="sync-actions">
            <button className="btn btn-primary" type="button" onClick={handleSync} disabled={syncing || !online}>
              <RefreshCw size={16} className={syncing ? 'spin' : ''} aria-hidden="true" />
              {syncing ? 'Synchronisation en cours…' : 'Synchroniser maintenant'}
            </button>
            {!online && <span>Action disponible dès le retour du réseau.</span>}
          </div>
        )}

        {lastResult && !lastResult.error && (
          <Alert tone={failedResults.length ? 'warning' : 'success'} title="Dernière synchronisation">
            {(lastResult.results || []).filter(result => result.status === 'synced').length} opération(s) envoyée(s).
            {failedResults.length > 0 && ` ${failedResults.length} opération(s) restent à reprendre.`}
          </Alert>
        )}
        {lastResult?.error && (
          <Alert tone="danger" title="Synchronisation interrompue">
            {lastResult.error}. Vos données restent enregistrées sur cet appareil.
          </Alert>
        )}
      </Panel>

      {failedResults.length > 0 && (
        <Panel title="Erreurs de la dernière tentative" className="mb-6">
          <ul className="operation-errors">
            {failedResults.map((result, index) => (
              <li key={`${result.entity_id || 'operation'}-${index}`}>
                <StatusBadge tone="danger">{result.status || 'Échec'}</StatusBadge>
                <span>{result.entity_id || 'Entité non identifiée'}</span>
                <strong>{result.error || result.message || 'Opération non synchronisée'}</strong>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {queue.length > 0 && (
        <Panel title="File d’attente locale" className="table-panel">
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Opération</th><th>Entité</th><th>Date locale</th><th>Statut</th></tr></thead>
              <tbody>
                {queue.map(operation => (
                  <tr key={operation.id}>
                    <td>{operation.entity_type}</td>
                    <td><StatusBadge tone="neutral">{operation.operation}</StatusBadge></td>
                    <td className="font-mono text-xs">{operation.entity_id?.slice(0, 8)}…</td>
                    <td>{formatDateTime(operation.local_timestamp)}</td>
                    <td><StatusBadge tone="warning"><Clock size={12} aria-hidden="true" /> En attente</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
