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
      setError(err.message || 'Identifiants incorrects. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">FC</div>
          <h1 className="login-title">FresCoop</h1>
          <p className="login-subtitle">Plateforme de scoring microcrédit agricole</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: 'var(--c-error-light)', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--r-lg)', fontSize: 'var(--fs-base)', marginBottom: 20, border: '1px solid #fca5a5' }}>
              {error}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="email">Adresse email</label>
            <input id="email" type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="email" />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">Mot de passe</label>
            <input id="password" type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            <LogIn size={16} />
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ marginTop: 32, textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--c-400)' }}>
          CIF DigiCoop-WA+ 2026
        </p>
      </div>
    </div>
  );
}
