import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Scale,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';

const scoreDimensions = [
  ['Identité', '15 / 15'],
  ['Capacité', '29 / 35'],
  ['Preuves', '24 / 30'],
  ['Risques', '16 / 20'],
];

export default function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-brand">
          <span className="landing-monogram" aria-hidden="true">FC</span>
          <span><strong>FresCoop</strong><small>Instruction du crédit agricole</small></span>
        </div>
        <span className="landing-program">CIF DigiCoop-WA+ 2026</span>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Outil d'aide à l'instruction</p>
            <h1>Un dossier agricole expliqué avant d'être décidé.</h1>
            <p className="landing-lead">
              FresCoop rassemble les données, vérifie la capacité de remboursement et rend chaque composante du score lisible. La décision reste entre les mains des personnes habilitées.
            </p>
            <Link to="/login" className="btn btn-primary btn-lg landing-cta">
              Accéder à FresCoop <ArrowRight size={17} />
            </Link>
            <p className="landing-cta-note">Accès sécurisé réservé aux équipes autorisées.</p>
          </div>

          <article className="landing-dossier-preview" aria-label="Aperçu d'un dossier FresCoop">
            <header className="landing-preview-header">
              <div><span className="landing-preview-ref">Dossier FC-2026-0142</span><h2>Exploitation rizicole</h2></div>
              <span className="badge badge-warning">Revue requise</span>
            </header>
            <div className="landing-preview-main">
              <div className="landing-preview-score"><strong>84</strong><span>sur 100</span><small>Score définitif</small></div>
              <dl className="landing-preview-finance">
                <div><dt>Montant demandé</dt><dd>850 000 FCFA</dd></div>
                <div><dt>Total remboursable</dt><dd>935 000 FCFA</dd></div>
                <div><dt>Autorité</dt><dd>Superviseur</dd></div>
              </dl>
            </div>
            <div className="landing-score-breakdown">
              {scoreDimensions.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            <p className="landing-preview-note"><CheckCircle2 size={15} /> Les motifs, preuves et données manquantes restent consultables.</p>
          </article>
        </section>

        <section className="landing-trust" aria-labelledby="trust-title">
          <div className="landing-section-heading"><p className="landing-eyebrow">Garanties opérationnelles</p><h2 id="trust-title">Conçu pour une instruction responsable</h2></div>
          <div className="landing-trust-grid">
            <TrustCard icon={FileCheck2} title="Score explicable">Quatre dimensions connues, des règles versionnées et un score provisoire clairement identifié lorsque le dossier est incomplet.</TrustCard>
            <TrustCard icon={WifiOff} title="Travail préservé hors ligne">Le brouillon reste sur l'appareil en faible connectivité, puis la synchronisation reprend sans masquer les erreurs.</TrustCard>
            <TrustCard icon={Scale} title="Décision humaine">L'orientation aide la revue mais n'accorde ni ne refuse automatiquement le crédit. Chaque décision est motivée et tracée.</TrustCard>
          </div>
        </section>

        <section className="landing-process" aria-labelledby="process-title">
          <div className="landing-section-heading"><p className="landing-eyebrow">Parcours condensé</p><h2 id="process-title">De la collecte au comité, sans rupture d'information</h2></div>
          <ol className="landing-process-list">
            <ProcessStep number="01" title="Documenter">L'agent saisit le projet, le financement, les revenus saisonniers et rattache les preuves disponibles.</ProcessStep>
            <ProcessStep number="02" title="Analyser">FresCoop calcule la capacité, le score et les scénarios de stress. Teranga peut enrichir l'avis agronomique sans remplacer le calcul local.</ProcessStep>
            <ProcessStep number="03" title="Décider">Le superviseur ou le comité consulte une synthèse unique, demande un complément si nécessaire et motive sa décision.</ProcessStep>
          </ol>
        </section>

        <section className="landing-continuity">
          <div className="landing-continuity-icon"><ShieldCheck size={26} /></div>
          <div><p className="landing-eyebrow">Sécurité et continuité</p><h2>Le service externe enrichit l'analyse, il ne conditionne jamais le dossier.</h2><p>En cas d'indisponibilité de Teranga, FresCoop conserve son rapport local déterministe sans ajouter de pénalité. Les accès suivent les rôles et l'historique permet de reconstituer chaque étape.</p></div>
        </section>
      </main>

      <footer className="landing-footer"><span>FresCoop · Sénégal</span><span>Données de démonstration synthétiques uniquement</span></footer>
    </div>
  );
}

function TrustCard({ icon: Icon, title, children }) {
  return <article className="landing-trust-card"><span className="landing-card-icon"><Icon size={21} /></span><h3>{title}</h3><p>{children}</p></article>;
}

function ProcessStep({ number, title, children }) {
  return <li><span className="landing-process-number">{number}</span><div><h3>{title}</h3><p>{children}</p></div></li>;
}
