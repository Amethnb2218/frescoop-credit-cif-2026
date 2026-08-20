import { Link } from 'react-router-dom';
import { Shield, FileText, Wifi, WifiOff, Users, BarChart3, CheckCircle } from 'lucide-react';

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #e5e7eb', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#1b6b52', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>FC</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>FresCoop</span>
        </div>
        <Link to="/login" className="btn btn-primary">Accéder à la plateforme</Link>
      </header>

      {/* Hero */}
      <section style={{ padding: '64px 24px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 4, background: '#e8f5f0', color: '#1b6b52', fontSize: 11, fontWeight: 600, marginBottom: 16 }}>
          CIF DigiCoop-WA+ 2026 — Thématique 02 : Scoring Microcrédit
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a2332', lineHeight: 1.3, marginBottom: 12, letterSpacing: '-.5px' }}>
          Le copilote offline-first<br />de l'agent de crédit agricole
        </h1>
        <p style={{ fontSize: 15, color: '#5a6577', maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.6 }}>
          FresCoop transforme des données terrain dispersées en un dossier de crédit vérifiable,
          un cash-flow saisonnier et une recommandation explicable — sans jamais retirer la décision à l'humain.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/login" className="btn btn-primary btn-lg">Se connecter</Link>
        </div>
      </section>

      {/* Value proposition */}
      <section style={{ background: '#f5f6f8', padding: '48px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 32 }}>
            Un dossier plus vite, des preuves plus fortes, une décision qui reste humaine
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            <FeatureCard icon={<WifiOff size={20} />} title="Offline-first" desc="L'agent continue son travail même sans réseau. Les données se synchronisent au retour de la connexion." />
            <FeatureCard icon={<FileText size={20} />} title="Dossier vérifiable" desc="Chaque fait est associé à une preuve classée par niveau de vérification (A, B, C, D)." />
            <FeatureCard icon={<BarChart3 size={20} />} title="Cash-flow saisonnier" desc="Le système comprend que les revenus agricoles sont cycliques et adapte les échéanciers." />
            <FeatureCard icon={<Shield size={20} />} title="Scoring explicable" desc="Trois dimensions distinctes : confiance des preuves, capacité de remboursement, flags de risque." />
            <FeatureCard icon={<Users size={20} />} title="Décision humaine" desc="Le comité de crédit conserve le pouvoir de décision. Tout override est tracé et motivé." />
            <FeatureCard icon={<CheckCircle size={20} />} title="Audit complet" desc="Qui a fait quoi, quand, et pourquoi. Chaque action est journalisée et retrouvable." />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '48px 24px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 32 }}>
          Workflow de bout en bout
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          <Step n="1" label="L'agent crée le dossier sur le terrain" />
          <Step n="2" label="Collecte des preuves et visite terrain" />
          <Step n="3" label="Cash-flow saisonnier et stress tests" />
          <Step n="4" label="Évaluation automatique par règles métier" />
          <Step n="5" label="Préqualification en 3 dimensions" />
          <Step n="6" label="Revue superviseur et contrôles" />
          <Step n="7" label="Décision du comité de crédit" />
          <Step n="8" label="Export vers le système de référence" />
        </div>
      </section>

      {/* Roles */}
      <section style={{ background: '#f5f6f8', padding: '48px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 24 }}>
            Conçu pour chaque acteur de la chaîne de crédit
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <RoleCard role="Agent de crédit" desc="Collecte terrain, preuves, dossier complet" />
            <RoleCard role="Superviseur" desc="Revue qualité, vérification, validation" />
            <RoleCard role="Comité de crédit" desc="Décision, conditions, override motivé" />
            <RoleCard role="Risk Manager" desc="Règles, monitoring, analyse" />
            <RoleCard role="Auditeur" desc="Traçabilité, journal, reconstitution" />
            <RoleCard role="Administrateur" desc="Configuration, utilisateurs, produits" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 24px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#8b95a5' }}>
          FresCoop — Scoring microcrédit agricole · CIF DigiCoop-WA+ 2026 · Sénégal
        </p>
        <p style={{ fontSize: 11, color: '#8b95a5', marginTop: 4 }}>
          DONNÉES DE DÉMONSTRATION — Ce prototype utilise des données synthétiques uniquement.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 16 }}>
      <div style={{ color: '#1b6b52', marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#1a2332' }}>{title}</div>
      <div style={{ fontSize: 12, color: '#5a6577', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function Step({ n, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
      <span style={{ width: 24, height: 24, borderRadius: 4, background: '#e8f5f0', color: '#1b6b52', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{n}</span>
      <span style={{ color: '#1a2332' }}>{label}</span>
    </div>
  );
}

function RoleCard({ role, desc }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: '#1a2332', marginBottom: 2 }}>{role}</div>
      <div style={{ fontSize: 11, color: '#5a6577' }}>{desc}</div>
    </div>
  );
}
