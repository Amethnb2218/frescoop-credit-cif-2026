import { useState, useEffect } from 'react';
import { api, getUser } from '../lib/api';
import { ROLE_LABELS, formatDateTime } from '../lib/format';
import { Users, Key, Shield, UserPlus, Lock, AlertTriangle, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Alert from '../components/ui/Alert';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import Dialog from '../components/ui/Dialog';

export default function AdminPage() {
  const user = getUser();
  const [tab, setTab] = useState('users');

  if (!['ADMIN', 'SUPERADMIN', 'SUPPORT'].includes(user?.role)) {
    return <EmptyState title="Accès refusé" description="Votre rôle ne permet pas d’ouvrir l’administration." />;
  }

  return (
    <div>
      <PageHeader eyebrow="Paramètres de l’institution" title="Administration" subtitle="Gestion des utilisateurs, accès et diagnostic du système." />

      <div className="tab-list" role="tablist" aria-label="Rubriques d’administration">
        <button type="button" role="tab" aria-selected={tab === 'users'} className={`tab-item ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}><Users size={14} /> Utilisateurs</button>
        <button type="button" role="tab" aria-selected={tab === 'system'} className={`tab-item ${tab === 'system' ? 'active' : ''}`} onClick={() => setTab('system')}><AlertTriangle size={14} /> Système</button>
        <button type="button" role="tab" aria-selected={tab === 'password'} className={`tab-item ${tab === 'password' ? 'active' : ''}`} onClick={() => setTab('password')}><Lock size={14} /> Mon mot de passe</button>
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
    setLoading(true);
    setError('');
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

  async function handleCSVImport(file) {
    if (!file) return;
    setError(''); setSuccess('');
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) { setError('Le fichier CSV doit avoir un header et au moins 1 ligne'); return; }
    const header = lines[0].toLowerCase().split(/[;,]/).map(h => h.trim());
    const nameIdx = header.findIndex(h => h.includes('nom'));
    const emailIdx = header.findIndex(h => h.includes('email') || h.includes('mail'));
    const roleIdx = header.findIndex(h => h.includes('role') || h.includes('rôle'));
    const phoneIdx = header.findIndex(h => h.includes('tel') || h.includes('phone'));
    const agencyIdx = header.findIndex(h => h.includes('agence') || h.includes('agency'));
    const pwdIdx = header.findIndex(h => h.includes('mot') || h.includes('pass') || h.includes('pwd'));
    if (nameIdx < 0 || emailIdx < 0) { setError('Le CSV doit contenir au minimum les colonnes "nom" et "email"'); return; }
    let created = 0, errors = 0;
    const currentUser = getUser();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[;,]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (!cols[nameIdx] || !cols[emailIdx]) continue;
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('frescoop_token')}` },
          body: JSON.stringify({
            name: cols[nameIdx],
            email: cols[emailIdx],
            role: roleIdx >= 0 ? cols[roleIdx]?.toUpperCase() || 'AGENT' : 'AGENT',
            phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
            agency: agencyIdx >= 0 ? cols[agencyIdx] || '' : '',
            password: pwdIdx >= 0 ? cols[pwdIdx] || 'default2026' : 'default2026',
            tenant_id: currentUser.tenant_id,
          }),
        });
        if (res.ok) created++; else errors++;
      } catch { errors++; }
    }
    setSuccess(`Import terminé : ${created} créé(s), ${errors} erreur(s)`);
    loadUsers();
  }

  async function handleCreate() {
    setError(''); setSuccess('');
    if (!createForm.name || !createForm.email || !createForm.password) { setError('Nom, email et mot de passe requis'); return; }
    if (createForm.password.length < 6) { setError('Le mot de passe doit faire au moins 6 caractères'); return; }
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

  if (loading) return <LoadingState message="Chargement des utilisateurs…" />;

  return (
    <div>
      {error && <ErrorState title="Opération impossible" message={error} onRetry={loadUsers} />}
      {success && <Alert tone="success" title="Opération terminée">{success}</Alert>}

      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Utilisateurs ({users.length})</h2>
        <div className="flex gap-2">
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => handleCSVImport(e.target.files[0])} />
            Importer CSV
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(!creating)}><UserPlus size={14} /> Nouvel utilisateur</button>
        </div>
      </div>

      <div style={{ marginBottom: 16, position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-400)' }} />
        <input className="input" style={{ paddingLeft: 32 }} aria-label="Rechercher un utilisateur" placeholder="Rechercher par nom ou email..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {creating && (
        <div className="surface mb-4">
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 12 }}>Créer un utilisateur</h3>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="admin-user-name">Nom complet *</label>
              <input id="admin-user-name" className="input" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="admin-user-email">Email *</label>
              <input id="admin-user-email" className="input" type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="admin-user-password">Mot de passe *</label>
              <input id="admin-user-password" className="input" type="text" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 caractères" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="admin-user-role">Rôle</label>
              <select id="admin-user-role" className="input" value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
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
              <label className="field-label" htmlFor="admin-user-phone">Téléphone</label>
              <input id="admin-user-phone" className="input" value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="admin-user-agency">Agence</label>
              <input id="admin-user-agency" className="input" value={createForm.agency} onChange={e => setCreateForm(f => ({ ...f, agency: e.target.value }))} />
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

      <Dialog
        open={Boolean(resetUserId)}
        title="Réinitialiser le mot de passe"
        description={`Utilisateur : ${users.find(item => item.id === resetUserId)?.name || ''}`}
        onClose={() => setResetUserId(null)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setResetUserId(null)}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={handleReset}>Réinitialiser</button>
          </>
        )}
      >
        <div className="field">
          <label className="field-label" htmlFor="reset-password">Nouveau mot de passe</label>
          <input id="reset-password" className="input" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="6 caractères minimum" autoFocus />
        </div>
      </Dialog>
    </div>
  );
}

function SystemTab() {
  const [health, setHealth] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { checkSystem(); }, []);

  async function checkSystem() {
    setLoading(true);
    setError('');
    const checks = [];
    try {
      const h = await api.health();
      setHealth(h);
    } catch (err) {
      checks.push({ level: 'critical', source: 'API', message: `Serveur inaccessible : ${err.message}`, time: new Date().toISOString() });
      setError(err.message || 'Serveur inaccessible');
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

  if (loading) return <LoadingState message="Vérification du système…" />;

  return (
    <div>
      {error && <ErrorState title="Serveur inaccessible" message={error} onRetry={checkSystem} />}
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

        {error && <Alert tone="danger" title="Modification impossible">{error}</Alert>}
        {success && <Alert tone="success" title="Mot de passe modifié">{success}</Alert>}

        <div className="field">
          <label className="field-label" htmlFor="current-password">Mot de passe actuel</label>
          <input id="current-password" className="input" type="password" autoComplete="current-password" value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="new-password">Nouveau mot de passe</label>
          <input id="new-password" className="input" type="password" autoComplete="new-password" value={form.new1} onChange={e => setForm(f => ({ ...f, new1: e.target.value }))} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="confirm-password">Confirmer le nouveau mot de passe</label>
          <input id="confirm-password" className="input" type="password" autoComplete="new-password" value={form.new2} onChange={e => setForm(f => ({ ...f, new2: e.target.value }))} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handleChange}>Modifier le mot de passe</button>
      </div>
    </div>
  );
}
