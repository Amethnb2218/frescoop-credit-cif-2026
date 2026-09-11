import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, LockKeyhole, LogIn, WifiOff } from 'lucide-react';
import { api, logout, setAuth } from '../lib/api';
import { Alert, Button } from '../components/ui';

function loginErrorMessage(error) {
  if (!navigator.onLine) {
    return "Aucune connexion réseau. La première connexion à FresCoop doit être effectuée en ligne.";
  }
  if (error instanceof TypeError || /fetch|network|réseau/i.test(error?.message || '')) {
    return "Le service FresCoop est momentanément indisponible. Vérifiez la connexion au serveur puis réessayez.";
  }
  if (/identifiants incorrects/i.test(error?.message || '')) {
    return "L'adresse email ou le mot de passe est incorrect.";
  }
  return error?.message || 'La connexion a échoué. Veuillez réessayer.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { logout(); }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.login(email.trim(), password);
      setAuth(response.token, response.user);
      navigate('/');
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-context" aria-labelledby="login-context-title">
        <div className="login-context-inner">
          <div className="login-wordmark"><span className="login-monogram">FC</span> FresCoop</div>
          <p className="login-eyebrow">Instruction du crédit agricole</p>
          <h1 id="login-context-title">Des dossiers vérifiables, de la collecte à la décision.</h1>
          <p>FresCoop structure les preuves, explique le score et conserve la responsabilité de la décision auprès des personnes habilitées.</p>
          <ul className="login-assurances">
            <li><CheckCircle2 size={17} /> Calcul déterministe et traçable</li>
            <li><WifiOff size={17} /> Saisie préservée en faible connectivité</li>
            <li><LockKeyhole size={17} /> Accès sécurisé selon le rôle</li>
          </ul>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-icon" aria-hidden="true">FC</div>
            <h2 className="login-title" id="login-title">Connexion à votre espace</h2>
            <p className="login-subtitle">Utilisez les identifiants attribués par votre établissement.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <Alert variant="error" title="Connexion impossible">{error}</Alert>}
            <div className="field">
              <label className="field-label" htmlFor="email">Adresse email</label>
              <input id="email" type="email" className="input" value={email} onChange={event => setEmail(event.target.value)} required autoFocus autoComplete="email" inputMode="email" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="password">Mot de passe</label>
              <input id="password" type="password" className="input" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" size="lg" loading={loading} className="login-submit">
              {!loading && <LogIn size={17} />}
              {loading ? 'Connexion en cours…' : 'Se connecter'}
            </Button>
          </form>
          <p className="login-footnote">CIF DigiCoop-WA+ 2026 · Accès réservé</p>
        </div>
      </section>
    </main>
  );
}
