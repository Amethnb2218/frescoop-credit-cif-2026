import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuth } from '../lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setAuth(res.token, res.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">FresCoop</h1>
        <p className="login-subtitle">Copilote offline-first de l'agent de crédit agricole</p>

        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 12px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" required />
          </div>

          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

      </div>
    </div>
  );
}
