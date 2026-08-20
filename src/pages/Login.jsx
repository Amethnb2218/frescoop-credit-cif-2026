import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setAuth } from '../lib/api';
import { LogIn } from 'lucide-react';

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
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #047857, #10b981)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.125rem' }}>FC</span>
          </div>
        </div>
        <h1 className="login-title">FresCoop</h1>
        <p className="login-subtitle">Plateforme de scoring microcrédit agricole</p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: 'var(--red-50)', color: 'var(--red-700)', padding: '10px 14px', borderRadius: 8, fontSize: '0.8125rem', marginBottom: 20, border: '1px solid var(--red-100)' }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Adresse email</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            <LogIn size={16} />
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: 'center', fontSize: '0.6875rem', color: 'var(--gray-400)' }}>
          CIF DigiCoop-WA+ 2026 — Thématique 02
        </p>
      </div>
    </div>
  );
}
