import { Link } from 'react-router-dom';
import { Shield, FileText, WifiOff, Users, BarChart3, CheckCircle, ArrowRight, Clock, Eye } from 'lucide-react';

export default function Landing() {
  return (
    <div className="landing-page" style={{ minHeight: '100vh', background: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="landing-header" style={{ borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#1b6b52', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>FC</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a2332' }}>FresCoop</span>
          <span className="landing-header-tag" style={{ fontSize: 11, color: '#5a6577', marginLeft: 4 }}>Scoring microcrédit</span>
        </div>
        <Link to="/login" className="btn btn-primary">Se connecter</Link>
      </header>

      {/* Hero - full width gradient banner */}
      <section className="landing-hero" style={{ position: 'relative', minHeight: 360, overflow: 'hidden', background: 'linear-gradient(135deg, #0f3d2e 0%, #1b6b52 40%, #2d8a6e 70%, #3da67d 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.5) 35px, rgba(255,255,255,.5) 36px)', backgroundSize: '50px 50px' }}></div>
        <svg className="landing-hero-svg" style={{ position: 'absolute', right: 40, bottom: 20, opacity: 0.12 }} width="280" height="280" viewBox="0 0 100 100" fill="none"><path d="M50 10 C50 10 30 30 30 55 C30 75 45 90 50 90 C55 90 70 75 70 55 C70 30 50 10 50 10Z" stroke="#fff" strokeWidth="1.5"/><path d="M50 20 L50 80" stroke="#fff" strokeWidth="0.8"/><path d="M50 40 L35 30" stroke="#fff" strokeWidth="0.8"/><path d="M50 50 L65 40" stroke="#fff" strokeWidth="0.8"/><path d="M50 60 L38 52" stroke="#fff" strokeWidth="0.8"/><path d="M50 70 L62 62" stroke="#fff" strokeWidth="0.8"/><circle cx="20" cy="80" r="8" stroke="#fff" strokeWidth="0.8"/><circle cx="80" cy="75" r="6" stroke="#fff" strokeWidth="0.8"/><path d="M10 85 Q15 70 25 80" stroke="#fff" strokeWidth="0.8"/></svg>
        <div className="landing-hero-content" style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '40px 48px', minHeight: 360 }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ padding: '3px 10px', borderRadius: 4, background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'inline-block', marginBottom: 16 }}>
              CIF DigiCoop-WA+ 2026 — Sénégal
            </div>
            <h1 className="landing-hero-title" style={{ fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 14 }}>
              Le copilote de l'agent de crédit agricole
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.85)', lineHeight: 1.7, marginBottom: 24 }}>
              FresCoop transforme les réalités du terrain en un dossier de crédit vérifiable.
              Cash-flow saisonnier, preuves classées, recommandation explicable — même sans réseau.
            </p>
            <Link to="/login" className="btn btn-lg" style={{ background: '#fff', color: '#0f3d2e', fontWeight: 600, border: 'none' }}>Accéder à la plateforme <ArrowRight size={14} /></Link>
            <div className="landing-mini-stats" style={{ marginTop: 20, display: 'flex', gap: 20 }}>
              <MiniStat icon={<Clock size={14} />} label="Instruction 2x plus rapide" light />
              <MiniStat icon={<WifiOff size={14} />} label="Fonctionne hors ligne" light />
              <MiniStat icon={<Eye size={14} />} label="Décision traçable" light />
            </div>
          </div>
        </div>
      </section>

      {/* Avant/Après section */}
      <section className="landing-section" style={{ background: '#f8faf9' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 8 }}>
            Impact mesurable
          </h2>
          <p style={{ textAlign: 'center', color: '#5a6577', fontSize: 14, maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.6 }}>
            L'instruction d'un microcrédit agricole prend aujourd'hui 5 jours en moyenne. FresCoop réduit ce délai à 2 heures grâce au scoring automatisé.
          </p>
          <div className="landing-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <ProblemCard number="5 jours" label="Avant FresCoop" desc="Instruction manuelle, subjective, sans traçabilité ni structure" />
            <ProblemCard number="2 heures" label="Avec FresCoop" desc="Scoring automatisé, preuves classées, décision tracée et explicable" />
            <ProblemCard number="95%" label="Réduction du délai" desc="De la collecte terrain au score final, tout est structuré et instantané" />
          </div>
        </div>
      </section>

      {/* Comment fonctionne le scoring */}
      <section className="landing-section" style={{ background: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 8 }}>
            Comment fonctionne le scoring
          </h2>
          <p style={{ textAlign: 'center', color: '#5a6577', fontSize: 13, marginBottom: 32 }}>
            Un score 0-100, explicable, calculé à partir de données vérifiables — pas une boîte noire
          </p>
          <div className="landing-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            <ScoringStep n="1" title="Collecte structurée" desc="L'agent classe chaque preuve selon sa fiabilité : A (vérifiée), B (tiers fiable), C (document), D (déclaration). Plus les preuves sont solides, plus le score monte." color="#059669" />
            <ScoringStep n="2" title="Analyse saisonnière" desc="Le cash-flow est modélisé mois par mois. Des stress tests simulent une baisse de revenus de 20-40% pour évaluer la résilience." color="#2563eb" />
            <ScoringStep n="3" title="Score explicable" desc="Le moteur de règles produit un score 0-100 avec les raisons. Le comité voit pourquoi ce score — pas de décision opaque." color="#7c3aed" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 32 }}>
            Comment FresCoop transforme l'instruction du crédit
          </h2>
          <div className="landing-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <FeatureCard icon={<WifiOff size={20} />} title="Offline-first" desc="L'agent continue son travail sans réseau. Données chiffrées localement, synchronisées au retour de la connexion sans doublon." />
            <FeatureCard icon={<FileText size={20} />} title="Evidence Ledger" desc="Chaque fait critique est associé à une preuve classée : source vérifiée (A), tiers fiable (B), document (C), déclaration (D)." />
            <FeatureCard icon={<BarChart3 size={20} />} title="Cash-flow saisonnier" desc="Le système comprend que les revenus agricoles sont cycliques. Stress tests automatiques pour tester la résilience." />
            <FeatureCard icon={<Shield size={20} />} title="Scoring rules-first" desc="Trois dimensions : confiance des preuves, capacité de remboursement, flags d'intégrité. Pas de score opaque." />
            <FeatureCard icon={<Users size={20} />} title="Décision humaine" desc="Le comité conserve le pouvoir. Tout override est motivé, enregistré et auditable. FresCoop recommande, l'IMF décide." />
            <FeatureCard icon={<CheckCircle size={20} />} title="Audit complet" desc="Qui a fait quoi, quand, et pourquoi. Chaque modification, chaque décision est tracée avec ancien/nouveau valeur." />
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="landing-section landing-section-dark" style={{ background: '#0f3d2e', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 32 }}>
            Workflow de bout en bout
          </h2>
          <div className="landing-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <WorkflowStep n="1" title="Collecte" desc="Agent terrain" />
            <WorkflowStep n="2" title="Analyse" desc="Moteur de règles" />
            <WorkflowStep n="3" title="Revue" desc="Superviseur" />
            <WorkflowStep n="4" title="Décision" desc="Comité de crédit" />
          </div>
          <div className="landing-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <WorkflowStep n="5" title="Override" desc="Motivé et tracé" />
            <WorkflowStep n="6" title="Export" desc="Vers core banking" />
            <WorkflowStep n="7" title="Suivi" desc="Remboursement" />
            <WorkflowStep n="8" title="Audit" desc="Reconstitution" />
          </div>
        </div>
      </section>

      {/* For who */}
      <section className="landing-section">
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 8 }}>
            Conçu pour chaque acteur de la chaîne
          </h2>
          <p style={{ textAlign: 'center', color: '#5a6577', fontSize: 13, marginBottom: 28 }}>
            Chaque rôle a une vue adaptée à ses responsabilités
          </p>
          <div className="landing-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <RoleCard role="Agent de crédit" desc="Collecte terrain, preuves, dossier complet même hors connexion" />
            <RoleCard role="Superviseur" desc="Revue qualité, vérifications, contre-visites, validation" />
            <RoleCard role="Comité de crédit" desc="Mémo d'une page, décision motivée, conditions" />
            <RoleCard role="Risk Manager" desc="Règles versionnées, monitoring des overrides, analyse" />
            <RoleCard role="Auditeur" desc="Journal complet, reconstitution, ancien/nouveau valeur" />
            <RoleCard role="Administrateur" desc="Utilisateurs, agences, produits, configuration" />
          </div>
        </div>
      </section>

      {/* Business Model */}
      <section className="landing-section" style={{ background: '#f8faf9' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a2332', textAlign: 'center', marginBottom: 8 }}>
            Modèle économique
          </h2>
          <p style={{ textAlign: 'center', color: '#5a6577', fontSize: 13, marginBottom: 28 }}>
            FresCoop s'intègre dans l'écosystème existant des coopératives financières
          </p>
          <div className="landing-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1b6b52', marginBottom: 4 }}>Phase 1</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Pilote gratuit</div>
              <div style={{ fontSize: 11, color: '#5a6577', lineHeight: 1.5 }}>Déploiement dans 2-3 agences pilotes CIF. Validation terrain. Zéro coût pour la coopérative.</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1b6b52', marginBottom: 4 }}>Phase 2</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>SaaS par agence</div>
              <div style={{ fontSize: 11, color: '#5a6577', lineHeight: 1.5 }}>Abonnement mensuel par agence (15 000 - 50 000 FCFA/mois selon volume). ROI dès le 1er mois grâce aux impayés évités.</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1b6b52', marginBottom: 4 }}>Phase 3</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Réseau CIF</div>
              <div style={{ fontSize: 11, color: '#5a6577', lineHeight: 1.5 }}>Déploiement via le catalogue DigiCoop-WA+ dans les 5 pays. Licence réseau. Données agrégées anonymisées pour améliorer le scoring.</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '48px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a2332', marginBottom: 8 }}>Prêt à voir le scoring en action ?</h2>
        <p style={{ color: '#5a6577', fontSize: 13, marginBottom: 20 }}>Connectez-vous pour explorer un dossier de crédit scoré en temps réel.</p>
        <Link to="/login" className="btn btn-primary btn-lg">Tester le scoring</Link>
      </section>

      {/* Footer */}
      <footer style={{ padding: '24px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
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

function MiniStat({ icon, label, light }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: light ? 'rgba(255,255,255,.8)' : '#5a6577' }}>
      <span style={{ color: light ? '#a8d4c0' : '#1b6b52' }}>{icon}</span>
      {label}
    </div>
  );
}

function ProblemCard({ number, label, desc }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1b6b52' }}>{number}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1a2332', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#5a6577', marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 18 }}>
      <div style={{ color: '#1b6b52', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: '#1a2332' }}>{title}</div>
      <div style={{ fontSize: 12, color: '#5a6577', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function WorkflowStep({ n, title, desc }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{n}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#a8d4c0', marginTop: 2 }}>{desc}</div>
    </div>
  );
}

function ScoringStep({ n, title, desc, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, textAlign: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${color}15`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, marginBottom: 12, border: `2px solid ${color}` }}>{n}</div>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#1a2332', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#5a6577', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function RoleCard({ role, desc }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a2332', marginBottom: 4 }}>{role}</div>
      <div style={{ fontSize: 11, color: '#5a6577', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}
