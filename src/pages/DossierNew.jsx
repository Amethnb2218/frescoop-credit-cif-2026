import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { isOnline, saveDossierOffline, addToSyncQueue } from '../lib/offline';
import { formatCFA } from '../lib/format';
import { Save, WifiOff, ArrowLeft, ArrowRight, Check } from 'lucide-react';

const STEPS = [
  { key: 'demande', label: 'Demande' },
  { key: 'identite', label: 'Identité' },
  { key: 'activite', label: 'Activité' },
  { key: 'revenus', label: 'Revenus' },
  { key: 'charges', label: 'Charges' },
  { key: 'dettes', label: 'Dettes' },
  { key: 'garanties', label: 'Garanties' },
  { key: 'preuves', label: 'Preuves' },
  { key: 'analyse', label: 'Analyse' },
  { key: 'soumission', label: 'Soumission' },
];

export default function DossierNew() {
  const navigate = useNavigate();
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    amount_requested: '', credit_purpose: '', duration_months: '', desired_schedule: '',
    applicant_name: '', applicant_phone: '', applicant_id_number: '', applicant_location: '', applicant_activity: '',
    sector: 'Agriculture', activity_type: '', years_experience: '', surface_ha: '', production_cycle: '',
    revenue_agriculture: '', revenue_commerce: '', revenue_other: '', revenue_frequency: 'mensuel', main_buyer: '',
    expenses_agriculture: '', expenses_household: '', expenses_other: '',
    existing_debt_institution: '', existing_debt_amount: '', existing_debt_monthly: '', existing_debt_status: 'en_cours',
    savings_amount: '', guarantee_type: '', group_guarantee: '', other_guarantees: '',
    agent_note: '',
  });

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }
  function num(v) { return v ? Number(v) : null; }

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        applicant_name: form.applicant_name,
        applicant_phone: form.applicant_phone,
        applicant_id_number: form.applicant_id_number,
        applicant_location: form.applicant_location,
        applicant_activity: form.applicant_activity,
        sector: form.sector,
        activity_type: form.activity_type,
        years_experience: num(form.years_experience),
        surface_ha: num(form.surface_ha),
        production_cycle: form.production_cycle,
        amount_requested: num(form.amount_requested),
        credit_purpose: form.credit_purpose,
        duration_months: num(form.duration_months),
        desired_schedule: form.desired_schedule,
        savings_amount: num(form.savings_amount),
        guarantee_type: form.guarantee_type,
        group_guarantee: form.group_guarantee,
        other_guarantees: form.other_guarantees,
        agent_note: form.agent_note,
      };
      if (isOnline()) {
        const res = await api.createDossier(data);
        navigate(`/dossiers/${res.id}`);
      } else {
        const id = crypto.randomUUID();
        await saveDossierOffline({ id, ...data, status: 'draft', agent_id: user.id, created_offline: true });
        await addToSyncQueue({ operation: 'create', entity_type: 'dossier', entity_id: id, payload: data });
        navigate('/dossiers');
      }
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dossiers')} style={{ marginBottom: 8 }}>
          <ArrowLeft size={14} /> Retour
        </button>
        <h1 className="page-title">Nouvelle demande de crédit</h1>
        {!isOnline() && (
          <p className="page-subtitle" style={{ color: 'var(--c-warning)' }}>
            <WifiOff size={14} style={{ verticalAlign: -2 }} /> Hors connexion — Le dossier sera synchronisé au retour du réseau
          </p>
        )}
      </div>

      <div className="workflow-bar">
        {STEPS.map((s, i) => (
          <button key={s.key} className={`workflow-step ${i === step ? 'current' : i < step ? 'done' : ''}`} onClick={() => i <= step && setStep(i)}>
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <div className="surface">
        {step === 0 && <StepDemande form={form} update={update} />}
        {step === 1 && <StepIdentite form={form} update={update} />}
        {step === 2 && <StepActivite form={form} update={update} />}
        {step === 3 && <StepRevenus form={form} update={update} />}
        {step === 4 && <StepCharges form={form} update={update} />}
        {step === 5 && <StepDettes form={form} update={update} />}
        {step === 6 && <StepGaranties form={form} update={update} />}
        {step === 7 && <StepPreuves />}
        {step === 8 && <StepAnalyse form={form} />}
        {step === 9 && <StepSoumission form={form} update={update} saving={saving} onSave={handleSave} />}

        {step < 9 && (
          <div className="flex justify-between items-center" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
            {step > 0 ? <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> Précédent</button> : <div />}
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Suivant <ArrowRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepDemande({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Demande de crédit</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Montant demandé (FCFA) *</label>
          <input className="input" type="number" min="0" step="10000" value={form.amount_requested} onChange={e => update('amount_requested', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Durée souhaitée (mois) *</label>
          <input className="input" type="number" min="1" max="60" value={form.duration_months} onChange={e => update('duration_months', e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Objet du crédit *</label>
          <textarea className="input" rows={3} value={form.credit_purpose} onChange={e => update('credit_purpose', e.target.value)} />
          <div className="field-hint">Décrivez précisément l'utilisation prévue du financement</div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Calendrier de remboursement souhaité</label>
          <select className="input" value={form.desired_schedule} onChange={e => update('desired_schedule', e.target.value)}>
            <option value="">Sélectionner</option>
            <option value="Mensuel classique">Mensuel classique</option>
            <option value="Saisonnier (post-récolte)">Saisonnier (post-récolte)</option>
            <option value="Trimestriel">Trimestriel</option>
            <option value="In fine">In fine (capital à échéance)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function StepIdentite({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Identité du demandeur</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Nom complet *</label>
          <input className="input" value={form.applicant_name} onChange={e => update('applicant_name', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Téléphone</label>
          <input className="input" type="tel" value={form.applicant_phone} onChange={e => update('applicant_phone', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">N° pièce d'identité</label>
          <input className="input" value={form.applicant_id_number} onChange={e => update('applicant_id_number', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Localisation</label>
          <input className="input" value={form.applicant_location} onChange={e => update('applicant_location', e.target.value)} />
          <div className="field-hint">Village, commune, région</div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Activité principale déclarée</label>
          <input className="input" value={form.applicant_activity} onChange={e => update('applicant_activity', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function StepActivite({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Activité agricole</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Filière</label>
          <select className="input" value={form.sector} onChange={e => update('sector', e.target.value)}>
            <option value="Agriculture">Agriculture</option>
            <option value="Élevage">Élevage</option>
            <option value="Pêche">Pêche</option>
            <option value="Transformation">Transformation</option>
            <option value="Commerce agricole">Commerce agricole</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Type d'activité</label>
          <input className="input" value={form.activity_type} onChange={e => update('activity_type', e.target.value)} />
          <div className="field-hint">Maraîchage, Riziculture, Aviculture...</div>
        </div>
        <div className="field">
          <label className="field-label">Années d'expérience</label>
          <input className="input" type="number" min="0" value={form.years_experience} onChange={e => update('years_experience', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Superficie exploitée (ha)</label>
          <input className="input" type="number" step="0.1" min="0" value={form.surface_ha} onChange={e => update('surface_ha', e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Cycle de production</label>
          <input className="input" value={form.production_cycle} onChange={e => update('production_cycle', e.target.value)} />
          <div className="field-hint">Oct-Mars (6 mois), Continu, Juil-Déc...</div>
        </div>
      </div>
    </div>
  );
}

function StepRevenus({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Sources de revenus</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Revenus agriculture (FCFA / période)</label>
          <input className="input" type="number" min="0" value={form.revenue_agriculture} onChange={e => update('revenue_agriculture', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Revenus commerce (FCFA / période)</label>
          <input className="input" type="number" min="0" value={form.revenue_commerce} onChange={e => update('revenue_commerce', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Autres revenus (FCFA / période)</label>
          <input className="input" type="number" min="0" value={form.revenue_other} onChange={e => update('revenue_other', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Fréquence des revenus</label>
          <select className="input" value={form.revenue_frequency} onChange={e => update('revenue_frequency', e.target.value)}>
            <option value="mensuel">Mensuel</option>
            <option value="trimestriel">Trimestriel</option>
            <option value="saisonnier">Saisonnier (1-2 fois/an)</option>
            <option value="hebdomadaire">Hebdomadaire</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Acheteur principal</label>
          <input className="input" value={form.main_buyer} onChange={e => update('main_buyer', e.target.value)} />
          <div className="field-hint">Coopérative, marché, acheteur B2B, consommateur direct...</div>
        </div>
      </div>
    </div>
  );
}

function StepCharges({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Charges mensuelles</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Charges agricoles (FCFA / mois)</label>
          <input className="input" type="number" min="0" value={form.expenses_agriculture} onChange={e => update('expenses_agriculture', e.target.value)} />
          <div className="field-hint">Intrants, semences, main-d'oeuvre, transport</div>
        </div>
        <div className="field">
          <label className="field-label">Charges du ménage (FCFA / mois)</label>
          <input className="input" type="number" min="0" value={form.expenses_household} onChange={e => update('expenses_household', e.target.value)} />
          <div className="field-hint">Alimentation, santé, éducation, logement</div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Autres charges (FCFA / mois)</label>
          <input className="input" type="number" min="0" value={form.expenses_other} onChange={e => update('expenses_other', e.target.value)} />
          <div className="field-hint">Cotisations, loyers, obligations sociales...</div>
        </div>
      </div>
    </div>
  );
}

function StepDettes({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Dettes existantes</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Renseignez le crédit en cours le plus important. Les autres seront ajoutés après création du dossier.</p>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Institution créancière</label>
          <input className="input" value={form.existing_debt_institution} onChange={e => update('existing_debt_institution', e.target.value)} />
          <div className="field-hint">IMF, banque, tontine, particulier...</div>
        </div>
        <div className="field">
          <label className="field-label">Montant restant dû (FCFA)</label>
          <input className="input" type="number" min="0" value={form.existing_debt_amount} onChange={e => update('existing_debt_amount', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Échéance mensuelle (FCFA)</label>
          <input className="input" type="number" min="0" value={form.existing_debt_monthly} onChange={e => update('existing_debt_monthly', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Statut du crédit</label>
          <select className="input" value={form.existing_debt_status} onChange={e => update('existing_debt_status', e.target.value)}>
            <option value="en_cours">En cours (à jour)</option>
            <option value="retard">En retard</option>
            <option value="termine">Terminé</option>
            <option value="aucun">Aucune dette</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function StepGaranties({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Épargne et garanties</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Épargne disponible (FCFA)</label>
          <input className="input" type="number" min="0" value={form.savings_amount} onChange={e => update('savings_amount', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Type de garantie</label>
          <select className="input" value={form.guarantee_type} onChange={e => update('guarantee_type', e.target.value)}>
            <option value="">Sélectionner</option>
            <option value="Caution solidaire">Caution solidaire groupe</option>
            <option value="Nantissement">Nantissement (récolte, équipement)</option>
            <option value="Épargne bloquée">Épargne bloquée</option>
            <option value="Mixte">Mixte</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Groupe de caution solidaire</label>
          <input className="input" value={form.group_guarantee} onChange={e => update('group_guarantee', e.target.value)} />
          <div className="field-hint">Nom du groupe et nombre de membres</div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Autres garanties</label>
          <textarea className="input" rows={2} value={form.other_guarantees} onChange={e => update('other_guarantees', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function StepPreuves() {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Preuves à collecter</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Après création du dossier, vous pourrez associer des preuves à chaque fait déclaré.
        Voici les pièces recommandées pour renforcer le dossier :
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <EvidenceGuidance level="A" label="Historique IMF" desc="Crédits précédents, remboursements, épargne — vérifiable dans le système" />
        <EvidenceGuidance level="B" label="Attestation coopérative" desc="Volumes livrés, montants de vente confirmés par la coopérative" />
        <EvidenceGuidance level="B" label="Confirmation acheteur" desc="Attestation ou bon de commande d'un acheteur identifié" />
        <EvidenceGuidance level="C" label="Reçus et documents" desc="Factures, reçus de vente, relevés mobile money — non vérifiés" />
        <EvidenceGuidance level="D" label="Déclarations" desc="Revenus, charges, activité déclarés par le demandeur" />
      </div>
      <div style={{ marginTop: 16, padding: 12, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-12)', color: 'var(--c-text-secondary)' }}>
        Une visite terrain est recommandée pour confirmer l'activité déclarée et observer le contexte de production.
      </div>
    </div>
  );
}

function EvidenceGuidance({ level, label, desc }) {
  const colors = { A: '#e8f5f0', B: '#e8f0fd', C: '#fdf6e8', D: '#f3f4f6' };
  const textColors = { A: '#1b6b52', B: '#1a5aa0', C: '#a0650a', D: '#5a6577' };
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 12px', border: '1px solid var(--c-border-light)', borderRadius: 'var(--radius)', background: '#fff' }}>
      <span style={{ width: 28, height: 28, borderRadius: 'var(--radius)', background: colors[level], color: textColors[level], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--fs-12)', flexShrink: 0 }}>{level}</span>
      <div>
        <div className="font-semibold" style={{ fontSize: 'var(--fs-13)' }}>{label}</div>
        <div className="text-sm text-muted">{desc}</div>
      </div>
    </div>
  );
}

function StepAnalyse({ form }) {
  const revAgri = Number(form.revenue_agriculture) || 0;
  const revCommerce = Number(form.revenue_commerce) || 0;
  const revOther = Number(form.revenue_other) || 0;
  const totalRevPeriod = revAgri + revCommerce + revOther;

  const multiplier = form.revenue_frequency === 'mensuel' ? 12 : form.revenue_frequency === 'trimestriel' ? 4 : form.revenue_frequency === 'hebdomadaire' ? 52 : 1;
  const totalRevAnnuel = totalRevPeriod * multiplier;

  const expAgri = Number(form.expenses_agriculture) || 0;
  const expHousehold = Number(form.expenses_household) || 0;
  const expOther = Number(form.expenses_other) || 0;
  const totalExpMensuel = expAgri + expHousehold + expOther;
  const totalExpAnnuel = totalExpMensuel * 12;

  const debtMonthly = Number(form.existing_debt_monthly) || 0;
  const totalDebtAnnuel = debtMonthly * 12;

  const fluxNet = totalRevAnnuel - totalExpAnnuel - totalDebtAnnuel;
  const amount = Number(form.amount_requested) || 0;
  const duration = Number(form.duration_months) || 1;
  const echeance = amount > 0 ? Math.ceil(amount / duration) : 0;

  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Analyse préliminaire</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Résumé calculé à partir des informations saisies. L'analyse complète sera effectuée après soumission du dossier.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <SummaryLine label="Revenus annuels estimés" value={formatCFA(totalRevAnnuel)} color="var(--c-success)" />
        <SummaryLine label="Charges annuelles estimées" value={formatCFA(totalExpAnnuel)} color="var(--c-danger)" />
        <SummaryLine label="Service de dette annuel" value={formatCFA(totalDebtAnnuel)} color="var(--c-danger)" />
        <SummaryLine label="Flux net annuel estimé" value={formatCFA(fluxNet)} color={fluxNet >= 0 ? 'var(--c-success)' : 'var(--c-danger)'} />
      </div>

      <div style={{ padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 'var(--fs-12)' }}>
          <span className="text-muted">Montant demandé</span>
          <span className="font-semibold">{formatCFA(amount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 'var(--fs-12)' }}>
          <span className="text-muted">Durée</span>
          <span className="font-semibold">{duration} mois</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-12)' }}>
          <span className="text-muted">Échéance mensuelle estimée</span>
          <span className="font-semibold">{formatCFA(echeance)}</span>
        </div>
      </div>

      {echeance > 0 && fluxNet > 0 && (
        <div style={{ padding: 12, borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-12)', background: echeance * 12 <= fluxNet ? 'var(--c-success-bg)' : 'var(--c-warning-bg)', color: echeance * 12 <= fluxNet ? 'var(--c-success)' : 'var(--c-warning)' }}>
          {echeance * 12 <= fluxNet
            ? 'Le flux net annuel estimé couvre les échéances annuelles.'
            : 'Attention : le flux net estimé pourrait ne pas couvrir toutes les échéances. Un calendrier saisonnier peut être envisagé.'}
        </div>
      )}
    </div>
  );
}

function SummaryLine({ label, value, color }) {
  return (
    <div style={{ padding: 12, background: '#fff', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)' }}>
      <div className="text-sm text-muted">{label}</div>
      <div style={{ fontSize: 'var(--fs-16)', fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function StepSoumission({ form, update, saving, onSave }) {
  const canSubmit = form.applicant_name && form.amount_requested && form.credit_purpose;

  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Vérification et soumission</h2>

      <div style={{ marginBottom: 20, padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-12)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><span className="text-muted">Demandeur :</span> <span className="font-semibold">{form.applicant_name || '—'}</span></div>
          <div><span className="text-muted">Montant :</span> <span className="font-semibold">{formatCFA(Number(form.amount_requested) || 0)}</span></div>
          <div><span className="text-muted">Objet :</span> <span className="font-semibold">{form.credit_purpose || '—'}</span></div>
          <div><span className="text-muted">Durée :</span> <span className="font-semibold">{form.duration_months || '—'} mois</span></div>
          <div><span className="text-muted">Localisation :</span> <span className="font-semibold">{form.applicant_location || '—'}</span></div>
          <div><span className="text-muted">Activité :</span> <span className="font-semibold">{form.activity_type || form.sector || '—'}</span></div>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Note de l'agent</label>
        <textarea className="input" rows={4} value={form.agent_note} onChange={e => update('agent_note', e.target.value)} />
        <div className="field-hint">Observations terrain, contexte, points d'attention pour le superviseur</div>
      </div>

      <div className="flex justify-between items-center" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
        <button className="btn btn-secondary" onClick={() => {}}>
          <ArrowLeft size={14} /> Revenir en arrière
        </button>
        <button className="btn btn-primary btn-lg" onClick={onSave} disabled={saving || !canSubmit}>
          <Save size={16} /> {saving ? 'Enregistrement...' : 'Créer le dossier'}
        </button>
      </div>
    </div>
  );
}
