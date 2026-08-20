import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { BookOpen, Search } from 'lucide-react';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => { loadLogs(); }, [actionFilter]);

  async function loadLogs() {
    try {
      const params = { limit: '200' };
      if (actionFilter) params.action = actionFilter;
      const res = await api.getAuditLog(params);
      setLogs(res.logs || []);
    } catch {} finally {
      setLoading(false);
    }
  }

  const actions = [...new Set(logs.map(l => l.action))].sort();

  const filtered = logs.filter(l => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (l.user_name || '').toLowerCase().includes(q) ||
           (l.action || '').toLowerCase().includes(q) ||
           (l.entity_type || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 24 }}>Journal d'audit</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#9ca3af' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <select className="form-input form-select" style={{ width: 'auto' }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
            <option value="">Toutes les actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Aucune entrée</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Action</th>
                  <th>Entité</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  let details = '';
                  try { const d = JSON.parse(l.details || '{}'); details = Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '); } catch {}
                  return (
                    <tr key={l.id}>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at)}</td>
                      <td><strong>{l.user_name}</strong></td>
                      <td><span className="badge badge-gray">{l.user_role}</span></td>
                      <td style={{ fontWeight: 500 }}>{l.action}</td>
                      <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{l.entity_type}{l.entity_id ? ` #${l.entity_id.slice(0, 8)}` : ''}</td>
                      <td style={{ fontSize: '0.75rem', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
