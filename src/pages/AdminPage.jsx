import { useState, useEffect } from 'react';
import { api, getUser } from '../lib/api';
import { ROLE_LABELS } from '../lib/format';
import { Users, Key, Shield, UserPlus, Lock } from 'lucide-react';

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
        <button className={`tab-item ${tab === 'password' ? 'active' : ''}`} onClick={() => setTab('password')}><Lock size={14} /> Mon mot de passe</button>
      </div>

      {tab === 'users' && <UsersTab />}
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
              {users.map(u => (
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
