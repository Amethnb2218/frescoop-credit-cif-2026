import { Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { isLoggedIn, getUser, logout, api } from './lib/api';
import { isOnline, onConnectivityChange } from './lib/offline';
import { ROLE_LABELS } from './lib/format';
import { ROLE_NAV } from './lib/tokens';
import { FileText, Home, Shield, Users, BookOpen, Scale, LogOut, WifiOff, Settings, Gavel, BarChart3, Package, RefreshCw, Menu, X } from 'lucide-react';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DossierList from './pages/DossierList';
import DossierNew from './pages/DossierNew';
import DossierDetail from './pages/DossierDetail';
import AuditLog from './pages/AuditLog';
import RulesPage from './pages/RulesPage';
import StatsPage from './pages/StatsPage';
import ProductsPage from './pages/ProductsPage';
import SyncPage from './pages/SyncPage';
import AdminPage from './pages/AdminPage';

const NAV_ITEMS = {
  dashboard: { to: '/', icon: Home, label: 'Tableau de bord' },
  dossiers: { to: '/dossiers', icon: FileText, label: 'Dossiers' },
  decisions: { to: '/dossiers?status=committee', icon: Gavel, label: 'Décisions' },
  rules: { to: '/rules', icon: Scale, label: 'Règles' },
  audit: { to: '/audit', icon: BookOpen, label: 'Audit' },
  stats: { to: '/stats', icon: BarChart3, label: 'Statistiques' },
  products: { to: '/products', icon: Package, label: 'Produits' },
  sync: { to: '/sync', icon: RefreshCw, label: 'Synchronisation' },
  admin: { to: '/admin', icon: Settings, label: 'Administration' },
};

function ProtectedRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/welcome" replace />;
  return children;
}

function Navigation({ mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();
  const allowedKeys = ROLE_NAV[user?.role] || ['dashboard', 'dossiers'];
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    if (isOnline()) {
      api.getDossiers().then(res => {
        const dossiers = res.dossiers || [];
        const role = user?.role;
        let count = 0;
        if (role === 'AGENT') count = dossiers.filter(d => d.status === 'draft').length;
        else if (role === 'SUPERVISEUR') count = dossiers.filter(d => ['submitted', 'verification', 'review'].includes(d.status)).length;
        else if (role === 'COMITE') count = dossiers.filter(d => d.status === 'committee').length;
        else count = dossiers.filter(d => ['submitted', 'verification', 'review', 'committee'].includes(d.status)).length;
        setBadge(count);
      }).catch(() => {});
    }
  }, [location.pathname]);

  return (
    <nav className={`nav-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="nav-brand">
        <div className="nav-brand-name">FresCoop</div>
        <div className="nav-brand-desc">Crédit agricole</div>
        <button className="mobile-close-btn" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Navigation</div>
        {allowedKeys.map(key => {
          const item = NAV_ITEMS[key];
          if (!item) return null;
          const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to.split('?')[0]);
          const showBadge = key === 'dossiers' && badge > 0;
          return (
            <Link key={key} to={item.to} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
              <item.icon size={16} />
              {item.label}
              {showBadge && <span className="nav-badge">{badge}</span>}
            </Link>
          );
        })}
      </div>

      <div className="nav-footer">
        <div className="nav-user-name">{user?.name}</div>
        <div className="nav-user-role">{ROLE_LABELS[user?.role] || user?.role}</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%', justifyContent: 'center', color: '#9ca3af' }} onClick={() => { logout(); navigate('/login'); }}>
          <LogOut size={14} /> Déconnexion
        </button>
      </div>
    </nav>
  );
}

function OfflineBanner({ online }) {
  if (online) return null;
  return (
    <div className="offline-banner">
      <WifiOff size={14} />
      Hors connexion — Votre travail est enregistré sur cet appareil
    </div>
  );
}

export default function App() {
  const [online, setOnline] = useState(isOnline());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => onConnectivityChange(setOnline), []);

  return (
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <ProtectedRoute>
          <div className="app-layout">
            <button className="mobile-hamburger" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
            {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)}></div>}
            <Navigation mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
            <OfflineBanner online={online} />
            <div className="page-content">
              <div className="page-inner">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dossiers" element={<DossierList />} />
                  <Route path="/dossiers/new" element={<DossierNew />} />
                  <Route path="/dossiers/:id" element={<DossierDetail />} />
                  <Route path="/rules" element={<RulesPage />} />
                  <Route path="/audit" element={<AuditLog />} />
                  <Route path="/stats" element={<StatsPage />} />
                  <Route path="/products" element={<ProductsPage />} />
                  <Route path="/sync" element={<SyncPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </div>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}
