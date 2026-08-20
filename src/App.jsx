import { Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { isLoggedIn, getUser, logout } from './lib/api';
import { isOnline, onConnectivityChange } from './lib/offline';
import { ROLE_LABELS } from './lib/format';
import { FileText, Home, Shield, BarChart3, Users, ClipboardList, LogOut, Wifi, WifiOff, Scale, BookOpen } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DossierList from './pages/DossierList';
import DossierNew from './pages/DossierNew';
import DossierDetail from './pages/DossierDetail';
import AuditLog from './pages/AuditLog';
import RulesPage from './pages/RulesPage';

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  const links = [
    { to: '/', icon: Home, label: 'Tableau de bord' },
    { to: '/dossiers', icon: FileText, label: 'Dossiers' },
    { to: '/rules', icon: Scale, label: 'Règles', roles: ['SUPERADMIN', 'ADMIN', 'RISK_MANAGER', 'SUPERVISEUR'] },
    { to: '/audit', icon: BookOpen, label: 'Journal d\'audit', roles: ['SUPERADMIN', 'ADMIN', 'AUDITEUR', 'RISK_MANAGER', 'SUPERVISEUR'] },
  ];

  const visibleLinks = links.filter(l => !l.roles || l.roles.includes(user?.role));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">FresCoop</div>
      <div className="sidebar-subtitle">Copilote Crédit Agricole</div>
      <nav className="sidebar-nav">
        {visibleLinks.map(l => (
          <Link key={l.to} to={l.to} className={`sidebar-link ${location.pathname === l.to || (l.to !== '/' && location.pathname.startsWith(l.to)) ? 'active' : ''}`}>
            <l.icon size={18} />
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8 }}>
          <strong>{user?.name}</strong><br />
          <span>{ROLE_LABELS[user?.role] || user?.role}</span>
        </div>
        <button className="btn btn-sm btn-secondary" style={{ width: '100%' }} onClick={() => { logout(); navigate('/login'); }}>
          <LogOut size={14} /> Déconnexion
        </button>
      </div>
    </aside>
  );
}

function OfflineBanner({ online }) {
  if (online) return null;
  return (
    <div className="offline-banner">
      <WifiOff size={16} />
      MODE HORS CONNEXION — Les données seront synchronisées au retour du réseau
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    return onConnectivityChange(setOnline);
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <ProtectedRoute>
          <div className="app-shell">
            <Sidebar />
            <OfflineBanner online={online} />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dossiers" element={<DossierList />} />
                <Route path="/dossiers/new" element={<DossierNew />} />
                <Route path="/dossiers/:id" element={<DossierDetail />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/audit" element={<AuditLog />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}
