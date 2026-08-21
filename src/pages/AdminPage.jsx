import { useState, useEffect } from 'react';
import { api, getUser } from '../lib/api';
import { ROLE_LABELS, formatDateTime } from '../lib/format';
import { Users, Key, Shield, UserPlus, Lock, AlertTriangle, Search } from 'lucide-react';

export default function AdminPage() {
  const user = getUser();
  const [tab, setTab] = useState('users');

  if (!['ADMIN', 'SUPERADMIN', 'SUPPORT'].includes(user?.role)) {
    return <div className="empty-state"><div className="empty-state-title">Accès refusé</div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Administration</h1>
        <p className="page-subtitle">Gestion des utilisateurs et paramètres</p>
      </div>

      <div className="tab-list">
        <button className={`tab-item ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}><Users size={14} /> Utilisateurs</button>
        <button className={`tab-item ${tab === 'system' ? 'active' : ''}`} onClick={() => setTab('system')}><AlertTriangle size={14} /> Système</button>
        <button className={`tab-item ${tab === 'password' ? 'active' : ''}`} onClick={() => setTab('password')}><Lock size={14} /> Mon mot de passe</button>
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'password' && <PasswordTab />}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetUserId, setResetUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', role: 'AGENT', phone: '', agency: '', password: '' });
  const [search, setSearch] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleReset() {
    setError(''); setSuccess('');
    if (!newPassword || newPassword.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return; }
    try {
      const res = await api.resetUserPassword(resetUserId, newPassword);
      setSuccess(res.message);
      setResetUserId(null);
      setNewPassword('');
    } catch (err) { setError(err.message); }
  }

  async function handleToggle(userId) {
    setError(''); setSuccess('');
    try {
      const res = await api.toggleUser(userId);
      setSuccess(res.active ? 'Utilisateur activé' : 'Utilisateur désactivé');
      loadUsers();
    } catch (err) { setError(err.message); }
  }

  async function handleCreate() {
    setError(''); setSuccess('');
    if (!createForm.name || !createForm.email || !createForm.password) { setError('Nom, email et mot de passe requis'); return; }
    if (createForm.password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return; }
    try {
      const user = getUser();
      await api.login(user.email, ''); // we need tenant_id
    } catch {}
    try {
      const currentUser = getUser();
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('frescoop_token')}` },
        body: JSON.stringify({ ...createForm, tenant_id: currentUser.tenant_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Utilisateur ${createForm.name} créé`);
      setCreating(false);
      setCreateForm({ name: '', email: '', role: 'AGENT', phone: '', agency: '', password: '' });
      loadUsers();
    } catch (err) { setError(err.message); }
  }

  if (loading) return <div className="loading-state">Chargement...</div>;

  return (
    <div>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}
      {success && <div style={{ background: '#ecfdf5', color: '#059669', padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #a7f3d0' }}>{success}</div>}

      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Utilisateurs ({users.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(!creating)}><UserPlus size={14} /> Nouvel utilisateur</button>
      </div>

      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-400)' }} />
        <input className="input" style={{ paddingLeft: 32 }} placeholder="Rechercher par nom ou email..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {creating && (
        <div className="surface mb-4">
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 12 }}>Créer un utilisateur</h3>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Nom complet *</label>
              <input className="input" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Email *</label>
              <input className="input" type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Mot de passe *</label>
              <input className="input" type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 caractères" />
            </div>
            <div className="field">
              <label className="field-label">Rôle</label>
              <select className="input" value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
                <option value="AGENT">Agent de crédit</option>
                <option value="SUPERVISEUR">Superviseur</option>
                <option value="COMITE">Comité de crédit</option>
                <option value="RISK_MANAGER">Gestionnaire des risques</option>
                <option value="AUDITEUR">Auditeur</option>
                <option value="SUPPORT">Support technique</option>
                <option value="ADMIN">Administrateur</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Téléphone</label>
              <input className="input" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Agence</label>
              <input className="input" value={createForm.agency} onChange={e => setCreateForm(f => ({ ...f, agency: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCreate}>Créer</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="surface" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Agence</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.filter(u => {
                if (!search) return true;
                const q = search.toLowerCase();
                return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              }).map(u => (
                <tr key={u.id}>
                  <td><div className="table-cell-primary">{u.name}</div></td>
                  <td style={{ fontSize: 'var(--fs-12)' }}>{u.email}</td>
                  <td><span className="badge badge-neutral">{ROLE_LABELS[u.role] || u.role}</span></td>
                  <td style={{ fontSize: 'var(--fs-12)' }}>{u.agency || '—'}</td>
                  <td><span className={`badge ${u.active ? 'badge-success' : 'badge-error'}`}>{u.active ? 'Actif' : 'Inactif'}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setResetUserId(u.id); setNewPassword(''); }} title="Réinitialiser le mot de passe"><Key size={13} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(u.id)} title={u.active ? 'Désactiver' : 'Activer'}><Shield size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {resetUserId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', padding: 24, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 16 }}>Réinitialiser le mot de passe</h3>
            <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', marginBottom: 12 }}>
              Utilisateur : <strong>{users.find(u => u.id === resetUserId)?.name}</strong>
            </p>
            <div className="field">
              <label className="field-label">Nouveau mot de passe</label>
              <input className="input" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 caractères" autoFocus />
            </div>
            <div className="flex gap-2" style={{ marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={handleReset}>Réinitialiser</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setResetUserId(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemTab() {
  const [health, setHealth] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkSystem(); }, []);

  async function checkSystem() {
    const checks = [];
    try {
      const h = await api.health();
      setHealth(h);
    } catch (err) {
      checks.push({ level: 'critical', source: 'API', message: `Serveur inaccessible : ${err.message}`, time: new Date().toISOString() });
    }

    try { await api.getDossiers(); }
    catch (err) { checks.push({ level: 'error', source: 'Dossiers', message: `Erreur accès dossiers : ${err.message}`, time: new Date().toISOString() }); }

    try { await api.getStats(); }
    catch (err) { checks.push({ level: 'warning', source: 'Stats', message: `Stats indisponibles : ${err.message}`, time: new Date().toISOString() }); }

    try { await api.getRules(); }
    catch (err) { checks.push({ level: 'warning', source: 'Règles', message: `Erreur accès règles : ${err.message}`, time: new Date().toISOString() }); }

    try { await api.getProducts(); }
    catch (err) { checks.push({ level: 'warning', source: 'Produits', message: `Erreur accès produits : ${err.message}`, time: new Date().toISOString() }); }

    setErrors(checks);
    setLoading(false);
  }

  const levelStyle = { critical: { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' }, error: { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' }, warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' } };

  if (loading) return <div className="loading-state">Vérification du système...</div>;

  return (
    <div>
      <div className="surface mb-4">
        <div className="surface-title">État du serveur</div>
        {health ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ padding: 12, background: '#ecfdf5', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Statut</div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#059669' }}>En ligne</div>
            </div>
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Mode</div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{health.mode}</div>
            </div>
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Version</div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{health.version}</div>
            </div>
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Produit</div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>{health.product}</div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, background: '#fef2f2', borderRadius: 'var(--radius)', color: '#dc2626', fontSize: 'var(--fs-12)' }}>Serveur inaccessible</div>
        )}
      </div>

      <div className="surface">
        <div className="surface-title">Diagnostic des services ({errors.length} problème{errors.length !== 1 ? 's' : ''} détecté{errors.length !== 1 ? 's' : ''})</div>
        {errors.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ecfdf5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Shield size={20} color="#059669" />
            </div>
            <p style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: '#059669' }}>Tous les services fonctionnent correctement</p>
            <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', marginTop: 4 }}>API, base de données, modules — aucune anomalie détectée</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {errors.map((e, i) => {
              const s = levelStyle[e.level] || levelStyle.warning;
              return (
                <div key={i} style={{ padding: '10px 14px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 'var(--fs-12)', fontWeight: 600, color: s.color }}>[{e.source}]</span>
                    <span style={{ fontSize: 'var(--fs-12)', color: s.color, marginLeft: 8 }}>{e.message}</span>
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: '#9ca3af' }}>{formatDateTime(e.time)}</span>
                </div>
              );
            })}
          </div>
        )}

        <button className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} onClick={() => { setLoading(true); checkSystem(); }}>
          Relancer le diagnostic
        </button>
      </div>
    </div>
  );
}

function PasswordTab() {
  const [form, setForm] = useState({ current: '', new1: '', new2: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleChange() {
    setError(''); setSuccess('');
    if (!form.current || !form.new1) { setError('Tous les champs sont requis'); return; }
    if (form.new1 !== form.new2) { setError('Les nouveaux mots de passe ne correspondent pas'); return; }
    if (form.new1.length < 6) { setError('Le nouveau mot de passe doit faire au moins 6 caractères'); return; }
    try {
      await api.changePassword(form.current, form.new1);
      setSuccess('Mot de passe modifié avec succès');
      setForm({ current: '', new1: '', new2: '' });
    } catch (err) { setError(err.message); }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <div className="surface">
        <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 16 }}>Changer mon mot de passe</h3>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}
        {success && <div style={{ background: '#ecfdf5', color: '#059669', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #a7f3d0' }}>{success}</div>}

        <div className="field">
          <label className="field-label">Mot de passe actuel</label>
          <input className="input" type="password" value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
        </div>
        <div className="field">
          <label className="field-label">Nouveau mot de passe</label>
          <input className="input" type="password" value={form.new1} onChange={e => setForm(f => ({ ...f, new1: e.target.value }))} />
        </div>
        <div className="field">
          <label className="field-label">Confirmer le nouveau mot de passe</label>
          <input className="input" type="password" value={form.new2} onChange={e => setForm(f => ({ ...f, new2: e.target.value }))} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleChange}>Modifier le mot de passe</button>
      </div>
    </div>
  );
}
