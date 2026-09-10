import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { buildLocalFeasibility } from '../agriculturalFeasibilityLocal';
import {
  addToSyncQueue,
  deleteDossierDraft,
  getDossierDraft,
  isOnline,
  saveDossierDraft,
  saveDossierOffline,
} from '../lib/offline';
import { CROP_OPTIONS, OTHER_CROP_VALUE, resolveCrop } from '../lib/agriculturalProject';
import { dossierDraftKey, restoreDraftEvidence, serializeDraftEvidence } from '../lib/dossierDraft';
import { formatCFA } from '../lib/format';
import { feasibilityReasonMessage } from '../../shared/agriculturalFeasibilityContract.js';
import { Save, WifiOff, ArrowLeft, ArrowRight, MapPin, Plus, Trash2, Pencil } from 'lucide-react';

const STEPS = [
  { key: 'identification', label: 'Identification et demande de crédit' },
  { key: 'projet', label: 'Projet agricole' },
  { key: 'faisabilite', label: 'Faisabilité agronomique' },
  { key: 'budget', label: 'Budget et revenus' },
  { key: 'preuves-garanties', label: 'Preuves et garanties' },
  { key: 'dettes', label: 'Dettes / BIC' },
  { key: 'resume', label: 'Résumé avant validation' },
];

const LOCATIONS = [
  'Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor', 'Tambacounda',
  'Kolda', 'Matam', 'Fatick', 'Kaffrine', 'Kédougou', 'Sédhiou', 'Diourbel', 'Louga',
  'Rufisque', 'Mbour', 'Tivaouane', 'Podor', 'Dagana', 'Richard-Toll',
  'Nioro du Rip', 'Koungheul', 'Vélingara', 'Bignona', 'Oussouye',
  'Foundiougne', 'Gossas', 'Mbacké', 'Bambey', 'Linguère', 'Kébémer',
  'Birkilane', 'Malem-Hodar', 'Koumpentoum', 'Goudiry', 'Bakel',
  'Ranérou', 'Saraya', 'Salémata', 'Médina Yoro Foulah', 'Bounkiling',
];

const ACTIVITY_TYPES = [
  'Grandes cultures', 'Maraîchage', 'Céréales (mil, sorgho, maïs)',
  'Arachide', 'Horticulture',
];

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function num(v) { return v === '' || v == null ? null : Number(v); }

function buildProjectAssessment(form) {
  const crop = resolveCrop(form.crop_selection, form.crop_other_label);
  return {
    ...crop, variety: form.crop_variety,
    crop_experience_years: num(form.crop_experience_years), project_surface_ha: num(form.project_surface_ha),
    land_access: form.land_access, agro_zone: form.agro_zone, soil_type: form.soil_type,
    soil_source: form.soil_source, season: form.season, cultivation_mode: form.irrigation_mode,
    water_source: form.water_source, water_reliability: form.water_reliability,
    sowing_month: form.production_cycle_start === '' ? null : Number(form.production_cycle_start) + 1,
    harvest_month: form.production_cycle_end === '' ? null : Number(form.production_cycle_end) + 1,
    expected_yield: num(form.expected_yield), expected_price: num(form.expected_price),
    loss_percent: num(form.loss_percent), own_contribution: num(form.own_contribution),
    other_funding: num(form.other_funding), climate_risks: form.climate_risks,
    mitigations: form.mitigations, market_channel: form.main_buyer,
    amount_requested: num(form.amount_requested),
  };
}

const GUARANTEE_TYPES = [
  { value: 'Caution solidaire', label: 'Caution solidaire (groupe de 5-10 membres)' },
  { value: 'Nantissement récolte', label: 'Nantissement de récolte (stock warrant)' },
  { value: 'Nantissement équipement', label: 'Nantissement d\'équipement agricole' },
  { value: 'Épargne bloquée', label: 'Épargne bloquée (% du crédit)' },
  { value: 'Hypothèque terrain', label: 'Hypothèque sur terrain titré' },
  { value: 'Gage matériel', label: 'Gage sur matériel roulant' },
  { value: 'Caution personnelle', label: 'Caution personnelle d\'un tiers' },
  { value: 'Mixte', label: 'Combinaison de garanties' },
];

export default function DossierNew() {
  const navigate = useNavigate();
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    amount_requested: '', credit_purpose: '', duration_months: '', desired_schedule: '',
    applicant_name: '', applicant_phone: '', applicant_id_number: '', applicant_location: '', applicant_activity: 'Agriculteur',
    sector: 'Agriculture', activity_type: '', years_experience: '', surface_ha: '', production_cycle_start: '', production_cycle_end: '', production_cycle: '',
    crop_selection: '', crop_other_label: '', crop_name: '', crop_variety: '', crop_experience_years: '', project_surface_ha: '', land_access: '', agro_zone: '', soil_type: '', soil_source: '', season: '', irrigation_mode: '', water_source: '', water_reliability: '', expected_yield: '', expected_price: '', loss_percent: '', own_contribution: '', other_funding: '', climate_risks: '', mitigations: '',
    revenue_commerce: '', commerce_revenue_frequency: 'mensuel', revenue_other: '', other_revenue_frequency: 'mensuel', main_buyer: '',
    expenses_agriculture: '', expenses_household: '',
    savings_amount: '', guarantee_type: '', group_guarantee: '', other_guarantees: '', third_party_commitment: false,
    guarantor_name: '', guarantor_id_number: '', guarantor_phone: '', guarantor_location: '', guarantor_relationship: '', guarantor_commitment_type: '', guarantor_commitment_amount: '', guarantor_consent: false,
    agent_note: '',
  });
  const [inputItems, setInputItems] = useState([]);
  const [declaredDebts, setDeclaredDebts] = useState([]);
  const [initialEvidence, setInitialEvidence] = useState([]);
  const [feasibilityAnalysis, setFeasibilityAnalysis] = useState(null);
  const [draftReady, setDraftReady] = useState(false);
  const dossierIdRef = useRef(crypto.randomUUID());
  const draftSaveTimerRef = useRef(null);
  const draftWriteRef = useRef(Promise.resolve());
  const draftDeletedRef = useRef(false);
  const draftKey = dossierDraftKey(user?.id);
  const feasibilityFingerprint = JSON.stringify({
    project: buildProjectAssessment(form),
    items: inputItems,
    city: form.applicant_location,
  });

  useEffect(() => {
    let active = true;
    async function restoreDraft() {
      try {
        const draft = await getDossierDraft(draftKey);
        if (!active || !draft) return;
        if (draft.form) setForm(current => ({ ...current, ...draft.form }));
        if (Array.isArray(draft.inputItems)) setInputItems(draft.inputItems);
        if (Array.isArray(draft.declaredDebts)) setDeclaredDebts(draft.declaredDebts);
        if (Array.isArray(draft.initialEvidence)) setInitialEvidence(restoreDraftEvidence(draft.initialEvidence));
        if (Number.isInteger(draft.step)) setStep(Math.max(0, Math.min(draft.step, STEPS.length - 1)));
        if (draft.dossierId) dossierIdRef.current = draft.dossierId;
      } catch (draftError) {
        console.error('Restauration du brouillon impossible', draftError);
      } finally {
        if (active) setDraftReady(true);
      }
    }
    restoreDraft();
    return () => { active = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return undefined;
    const timer = setTimeout(() => {
      if (draftDeletedRef.current) return;
      const draft = {
        id: draftKey,
        form,
        inputItems,
        declaredDebts,
        initialEvidence: serializeDraftEvidence(initialEvidence),
        step,
        dossierId: dossierIdRef.current,
      };
      draftWriteRef.current = draftWriteRef.current
        .catch(() => undefined)
        .then(() => draftDeletedRef.current ? undefined : saveDossierDraft(draft))
        .catch(draftError => console.error('Autosauvegarde du brouillon impossible', draftError));
    }, 400);
    draftSaveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (draftSaveTimerRef.current === timer) draftSaveTimerRef.current = null;
    };
  }, [draftReady, draftKey, form, inputItems, declaredDebts, initialEvidence, step]);

  useEffect(() => {
    setFeasibilityAnalysis(current => (
      current?.fingerprint === feasibilityFingerprint ? current : null
    ));
  }, [feasibilityFingerprint]);

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
      reader.readAsDataURL(file);
    });
  }

  function validateStep(index) {
    if (index === 0 && (!form.applicant_name.trim() || !form.applicant_id_number.trim())) return 'Le nom complet et le numéro de CNI sont obligatoires.';
    if (index === 0 && (!num(form.amount_requested) || !num(form.duration_months) || !form.credit_purpose.trim())) return 'Renseignez le montant, la durée et l’objet du crédit.';
    if (index === 1 && (!form.crop_selection || !num(form.project_surface_ha))) return 'Renseignez au minimum la culture et la surface du projet.';
    if (index === 1 && form.crop_selection === OTHER_CROP_VALUE && !form.crop_other_label.trim()) return 'Précisez la culture sélectionnée dans « Autre ».';
    if (index === 4 && form.third_party_commitment && (!form.guarantor_name.trim() || !form.guarantor_id_number.trim() || !form.guarantor_phone.trim() || !form.guarantor_consent)) return 'Renseignez le nom, la CNI, le téléphone et le consentement du garant tiers.';
    return '';
  }

  function nextStep() {
    const message = validateStep(step);
    if (message) { setError(message); return; }
    setError('');
    setStep(s => s + 1);
  }

  async function deleteSavedDraft() {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftDeletedRef.current = true;
    await draftWriteRef.current.catch(() => undefined);
    await deleteDossierDraft(draftKey);
  }

  async function handleSave() {
    const evidenceToReselect = initialEvidence.find(item => item.file_reselection_required && !item.file);
    if (evidenceToReselect) {
      setError(`Resélectionnez le fichier « ${evidenceToReselect.metadata?.file_name || evidenceToReselect.label} » avant de créer le dossier.`);
      return;
    }
    setSaving(true); setError('');
    try {
      const cycle = form.production_cycle_start !== '' && form.production_cycle_end !== ''
        ? `${MONTHS[form.production_cycle_start]} - ${MONTHS[form.production_cycle_end]}`
        : form.production_cycle;
      const frequencyMultiplier = frequency => ({ hebdomadaire: 52, mensuel: 12, trimestriel: 4, saisonnier: 1, annuel: 1 }[frequency] || 1);
      const commerceRevenue = Number(form.revenue_commerce === 'neant' ? 0 : form.revenue_commerce || 0);
      const otherRevenue = Number(form.revenue_other === 'neant' ? 0 : form.revenue_other || 0);
      const annualCommerceRevenue = commerceRevenue * frequencyMultiplier(form.commerce_revenue_frequency);
      const annualOtherRevenue = otherRevenue * frequencyMultiplier(form.other_revenue_frequency);
      const annualRevenue = annualCommerceRevenue + annualOtherRevenue;
      const monthlyExpenses = ['expenses_agriculture', 'expenses_household'].reduce((sum, key) => sum + Number(form[key] === 'neant' ? 0 : form[key] || 0), 0);
      const monthlyDebtPayments = declaredDebts.reduce((sum, debt) => sum + Number(debt.periodic_payment || 0), 0);
      const projectAssessment = buildProjectAssessment(form);
      const financialSummary = {
        annual_revenue: annualRevenue,
        commerce_revenue: commerceRevenue, commerce_revenue_frequency: form.commerce_revenue_frequency,
        other_revenue: otherRevenue, other_revenue_frequency: form.other_revenue_frequency,
        agricultural_expenses: Number(form.expenses_agriculture === 'neant' ? 0 : form.expenses_agriculture || 0),
        household_expenses: Number(form.expenses_household === 'neant' ? 0 : form.expenses_household || 0),
        monthly_expenses: monthlyExpenses,
        monthly_debt_payments: monthlyDebtPayments,
        revenue_detail: { commerce: commerceRevenue, other: otherRevenue, annual_commerce: annualCommerceRevenue, annual_other: annualOtherRevenue },
        expenses_detail: { agriculture: Number(form.expenses_agriculture === 'neant' ? 0 : form.expenses_agriculture || 0), household: Number(form.expenses_household === 'neant' ? 0 : form.expenses_household || 0) },
      };
      const data = {
        id: dossierIdRef.current,
        applicant_name: form.applicant_name,
        applicant_phone: form.applicant_phone,
        applicant_id_number: form.applicant_id_number,
        applicant_location: form.applicant_location,
        applicant_activity: form.applicant_activity,
        sector: form.sector,
        activity_type: form.activity_type,
        years_experience: num(form.years_experience),
        surface_ha: num(form.surface_ha),
        production_cycle: cycle,
        amount_requested: num(form.amount_requested),
        credit_purpose: form.credit_purpose,
        duration_months: num(form.duration_months),
        desired_schedule: form.desired_schedule,
        savings_amount: num(form.savings_amount),
        guarantee_type: form.guarantee_type,
        group_guarantee: form.group_guarantee,
        other_guarantees: form.other_guarantees,
        third_party_commitment: form.third_party_commitment,
        third_party_guarantor: form.third_party_commitment ? {
          name: form.guarantor_name,
          id_number: form.guarantor_id_number,
          phone: form.guarantor_phone,
          location: form.guarantor_location,
          relationship: form.guarantor_relationship,
          commitment_type: form.guarantor_commitment_type,
          commitment_amount: num(form.guarantor_commitment_amount),
          consent_given: form.guarantor_consent,
        } : null,
        agent_note: form.agent_note,
        project_assessment: projectAssessment,
        input_items: inputItems,
        declared_debts: declaredDebts,
        initial_evidence: initialEvidence.map(({ file, file_reselection_required, ...item }) => item),
        financial_summary: financialSummary,
      };
      if (isOnline()) {
        const res = await api.createDossier(data);
        for (const item of initialEvidence) {
          if (!item.file) continue;
          await api.saveEvidenceAttachment(item.id, {
            original_name: item.file.name,
            mime_type: item.file.type,
            content_base64: await fileToBase64(item.file),
          });
        }
        await deleteSavedDraft();
        navigate(`/dossiers/${res.id}`);
      } else {
        const id = data.id;
        await saveDossierOffline({ id, ...data, initial_evidence: initialEvidence.map(({ file_reselection_required, ...item }) => item), status: 'draft', agent_id: user.id, created_offline: true });
        await addToSyncQueue({ operation: 'create', entity_type: 'dossier', entity_id: id, payload: data });
        for (const item of initialEvidence) {
          if (!item.file) continue;
          await addToSyncQueue({
            operation: 'attachment', entity_type: 'evidence', entity_id: item.id,
            payload: { dossier_id: id, original_name: item.file.name, mime_type: item.file.type,
              content_base64: await fileToBase64(item.file) },
          });
        }
        await deleteSavedDraft();
        navigate('/dossiers');
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (!draftReady) {
    return (
      <div className="surface" style={{ padding: 20 }}>
        Restauration du brouillon en cours…
      </div>
    );
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

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}

      <div className="surface">
        {step === 0 && <>
          <StepDemandeIdentite form={form} update={update} />
          <SectionDivider />
          <StepActivite form={form} update={update} />
        </>}
        {step === 1 && <StepProjetAgricole form={form} update={update} />}
        {step === 2 && (
          <StepFaisabiliteAgronomique
            form={form}
            items={inputItems}
            analysis={feasibilityAnalysis}
            setAnalysis={setFeasibilityAnalysis}
          />
        )}
        {step === 3 && <>
          <StepBudgetIntrants form={form} items={inputItems} setItems={setInputItems} />
          <SectionDivider />
          <StepRevenus form={form} update={update} />
          <SectionDivider />
          <StepCharges form={form} update={update} />
        </>}
        {step === 4 && <>
          <StepGaranties form={form} update={update} />
          <SectionDivider />
          <StepPreuves evidence={initialEvidence} setEvidence={setInitialEvidence} />
        </>}
        {step === 5 && <StepDettes debts={declaredDebts} setDebts={setDeclaredDebts} />}
        {step === 6 && <>
          <StepAnalyse form={form} items={inputItems} debts={declaredDebts} />
          <SectionDivider />
          <StepSoumission form={form} update={update} saving={saving} onSave={handleSave} setStep={setStep} />
        </>}

        {step < STEPS.length - 1 && (
          <div className="flex justify-between items-center" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
            {step > 0 ? <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> Précédent</button> : <div />}
            <button className="btn btn-primary" onClick={nextStep}>Suivant <ArrowRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionDivider() {
  return <div style={{ borderTop: '1px solid var(--c-border)', margin: '24px 0' }} />;
}

function AutocompleteInput({ value, onChange, suggestions, placeholder, hint }) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const ref = useRef(null);

  function handleChange(v) {
    onChange(v);
    if (v.length >= 1) {
      const f = suggestions.filter(s => s.toLowerCase().includes(v.toLowerCase()));
      setFiltered(f.slice(0, 8));
      setOpen(f.length > 0);
    } else {
      setOpen(false);
    }
  }

  function select(s) {
    onChange(s);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <input
        className="input"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (value.length >= 1) handleChange(value); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
      />
      {hint && <div className="field-hint">{hint}</div>}
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid var(--c-border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 200, overflowY: 'auto' }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => select(s)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 'var(--fs-12)', borderBottom: '1px solid var(--c-border-light)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NeantField({ label, value, onChange, type = 'number', hint }) {
  const isNeant = value === '0' || value === 'neant';
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input className="input" type={type} min="0" value={isNeant ? '0' : value} onChange={e => onChange(e.target.value)} style={{ flex: 1 }} disabled={value === 'neant'} />
        <button type="button" className={`btn btn-sm ${value === 'neant' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange(value === 'neant' ? '' : 'neant')} style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
          Néant
        </button>
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function StepDemandeIdentite({ form, update }) {
  return (
    <div>
      <StepIdentite form={form} update={update} />
      <div style={{ borderTop: '1px solid var(--c-border)', margin: '24px 0' }} />
      <StepDemande form={form} update={update} />
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
          <input className="input" type="number" min="0" step="10000" value={form.amount_requested} onChange={e => update('amount_requested', e.target.value)} placeholder="Ex: 500000" />
        </div>
        <div className="field">
          <label className="field-label">Durée souhaitée (mois) *</label>
          <input className="input" type="number" min="1" max="60" value={form.duration_months} onChange={e => update('duration_months', e.target.value)} placeholder="Ex: 12" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Objet du crédit *</label>
          <textarea className="input" rows={3} value={form.credit_purpose} onChange={e => update('credit_purpose', e.target.value)} placeholder="Décrivez précisément l'utilisation prévue du financement" />
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
  function getGPS() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude.toFixed(4);
          const lon = pos.coords.longitude.toFixed(4);
          update('applicant_location', `${form.applicant_location ? form.applicant_location + ' ' : ''}(${lat}, ${lon})`);
        },
        () => {}
      );
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Identité du demandeur</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Nom complet *</label>
          <input className="input" value={form.applicant_name} onChange={e => update('applicant_name', e.target.value)} placeholder="Prénom et nom" />
        </div>
        <div className="field">
          <label className="field-label">Téléphone</label>
          <input className="input" type="tel" value={form.applicant_phone} onChange={e => update('applicant_phone', e.target.value)} placeholder="77 xxx xx xx" />
        </div>
        <div className="field">
          <label className="field-label">N° CNI *</label>
          <input className="input" required value={form.applicant_id_number} onChange={e => update('applicant_id_number', e.target.value)} placeholder="Numéro de carte nationale d’identité" />
          {!form.applicant_id_number && <div className="field-error">Le numéro de CNI est obligatoire pour poursuivre et soumettre le dossier.</div>}
        </div>
        <div className="field">
          <label className="field-label">Localisation</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <AutocompleteInput value={form.applicant_location} onChange={v => update('applicant_location', v)} suggestions={LOCATIONS} placeholder="Commencez à taper..." hint="Village, commune, région" />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={getGPS} title="Localisation GPS actuelle" style={{ height: 36, padding: '0 8px' }}>
              <MapPin size={14} />
            </button>
          </div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Activité principale déclarée</label>
          <input className="input" value="Agriculteur" readOnly aria-readonly="true" />
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
          <input className="input" value="Agriculture" readOnly aria-readonly="true" />
        </div>
        <div className="field">
          <label className="field-label">Type d'activité</label>
          <AutocompleteInput value={form.activity_type} onChange={v => update('activity_type', v)} suggestions={ACTIVITY_TYPES} placeholder="Commencez à taper..." hint="Grandes cultures, maraîchage, céréales, arachide ou horticulture" />
        </div>
        <div className="field">
          <label className="field-label">Années d'expérience</label>
          <input className="input" type="number" min="0" value={form.years_experience} onChange={e => update('years_experience', e.target.value)} placeholder="Ex: 5" />
        </div>
        <div className="field">
          <label className="field-label">Superficie exploitée (ha)</label>
          <input className="input" type="number" step="0.1" min="0" value={form.surface_ha} onChange={e => update('surface_ha', e.target.value)} placeholder="Ex: 2.5" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Cycle de production</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="input" value={form.production_cycle_start} onChange={e => update('production_cycle_start', e.target.value)} style={{ flex: 1 }}>
              <option value="">Mois de début</option>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', fontWeight: 500 }}>à</span>
            <select className="input" value={form.production_cycle_end} onChange={e => update('production_cycle_end', e.target.value)} style={{ flex: 1 }}>
              <option value="">Mois de fin</option>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="field-hint">
            {form.production_cycle_start !== '' && form.production_cycle_end !== '' &&
              `${MONTHS[form.production_cycle_start]} → ${MONTHS[form.production_cycle_end]} (${((Number(form.production_cycle_end) - Number(form.production_cycle_start) + 12) % 12) + 1} mois)`
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function StepProjetAgricole({ form, update }) {
  const crop = resolveCrop(form.crop_selection, form.crop_other_label);
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Projet agricole</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Décrivez la faisabilité technique et les estimations du projet.</p>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Culture *</label>
          <select className="input" value={form.crop_selection} onChange={e => {
            const selection = e.target.value;
            const resolved = resolveCrop(selection, form.crop_other_label);
            update('crop_selection', selection);
            update('crop_name', resolved.crop_label || '');
          }}>
            <option value="">Sélectionner une culture</option>
            {CROP_OPTIONS.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
            <option value={OTHER_CROP_VALUE}>Autre</option>
          </select>
        </div>
        {form.crop_selection === OTHER_CROP_VALUE && (
          <div className="field">
            <label className="field-label">Précisez la culture *</label>
            <input className="input" value={form.crop_other_label} onChange={e => {
              update('crop_other_label', e.target.value);
              update('crop_name', e.target.value);
            }} placeholder="Ex : Bissap rouge" />
          </div>
        )}
        <div className="field"><label className="field-label">Variété</label><input className="input" value={form.crop_variety} onChange={e => update('crop_variety', e.target.value)} /></div>
        <div className="field"><label className="field-label">Expérience sur cette culture (années)</label><input className="input" type="number" min="0" value={form.crop_experience_years} onChange={e => update('crop_experience_years', e.target.value)} /></div>
        <div className="field"><label className="field-label">Surface du projet (ha) *</label><input className="input" type="number" min="0" step="0.1" value={form.project_surface_ha} onChange={e => update('project_surface_ha', e.target.value)} /></div>
        <div className="field"><label className="field-label">Accès à la parcelle</label><select className="input" value={form.land_access} onChange={e => update('land_access', e.target.value)}><option value="">Sélectionner</option><option>Propriété</option><option>Location</option><option>Prêt familial</option><option>Parcelle communautaire</option></select></div>
        <div className="field"><label className="field-label">Zone agroécologique</label><input className="input" value={form.agro_zone} onChange={e => update('agro_zone', e.target.value)} /></div>
        <div className="field"><label className="field-label">Type / aptitude du sol</label><input className="input" value={form.soil_type} onChange={e => update('soil_type', e.target.value)} /></div>
        <div className="field"><label className="field-label">Source de l'information sur le sol</label><input className="input" value={form.soil_source} onChange={e => update('soil_source', e.target.value)} placeholder="Analyse, technicien, déclaration…" /></div>
        <div className="field"><label className="field-label">Saison</label><input className="input" value={form.season} onChange={e => update('season', e.target.value)} placeholder="Hivernage, saison sèche…" /></div>
        <div className="field"><label className="field-label">Mode de culture</label><select className="input" value={form.irrigation_mode} onChange={e => update('irrigation_mode', e.target.value)}><option value="">Sélectionner</option><option value="pluvial">Pluvial</option><option value="irrigué">Irrigué</option><option value="mixte">Mixte</option></select></div>
        <div className="field"><label className="field-label">Source d'eau</label><input className="input" value={form.water_source} onChange={e => update('water_source', e.target.value)} /></div>
        <div className="field"><label className="field-label">Fiabilité de l'eau</label><select className="input" value={form.water_reliability} onChange={e => update('water_reliability', e.target.value)}><option value="">Sélectionner</option><option value="sécurisée">Sécurisée</option><option value="partielle">Partielle</option><option value="incertaine">Incertaine</option></select></div>
      </div>
      <h3 style={{ fontSize: 'var(--fs-14)', margin: '20px 0 10px' }}>Estimations du projet</h3>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="field"><label className="field-label">Rendement (kg/ha)</label><input className="input" type="number" min="0" value={form.expected_yield} onChange={e => update('expected_yield', e.target.value)} /></div>
        <div className="field"><label className="field-label">Prix (FCFA/kg)</label><input className="input" type="number" min="0" value={form.expected_price} onChange={e => update('expected_price', e.target.value)} /></div>
        <div className="field"><label className="field-label">Pertes estimées (%)</label><input className="input" type="number" min="0" max="100" value={form.loss_percent} onChange={e => update('loss_percent', e.target.value)} /></div>
        <div className="field"><label className="field-label">Apport personnel (FCFA)</label><input className="input" type="number" min="0" value={form.own_contribution} onChange={e => update('own_contribution', e.target.value)} /></div>
        <div className="field"><label className="field-label">Autres financements (FCFA)</label><input className="input" type="number" min="0" value={form.other_funding} onChange={e => update('other_funding', e.target.value)} /></div>
        <div className="field"><label className="field-label">Risques principaux</label><input className="input" value={form.climate_risks} onChange={e => update('climate_risks', e.target.value)} placeholder="Sécheresse, ravageurs, prix…" /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">Mesures d'atténuation</label><textarea className="input" rows={2} value={form.mitigations} onChange={e => update('mitigations', e.target.value)} /></div>
      </div>
      {crop.crop_label && (
        <div className="field-hint" style={{ marginTop: 10 }}>
          Culture enregistrée : {crop.crop_label} ({crop.crop_code})
        </div>
      )}
    </div>
  );
}

function StepBudgetIntrants({ form, items, setItems }) {
  const [draft, setDraft] = useState({ category: 'Semences', label: '', quantity: '', unit: '', unit_cost: '', supplier: '' });
  const budget = items.length > 0
    ? items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0)
    : null;
  const surface = num(form.project_surface_ha);
  const expectedYield = num(form.expected_yield);
  const lossPercent = num(form.loss_percent);
  const expectedPrice = num(form.expected_price);
  const revenue = surface != null && surface > 0 && expectedYield != null && expectedYield > 0
    && lossPercent != null && lossPercent >= 0 && lossPercent <= 100
    && expectedPrice != null && expectedPrice >= 0
    ? surface * expectedYield * (1 - lossPercent / 100) * expectedPrice
    : null;
  function addItem() {
    if (!Number(draft.quantity) || !Number(draft.unit_cost)) return;
    setItems(list => [...list, { ...draft, label: draft.category, id: crypto.randomUUID() }]);
    setDraft({ category: 'Semences', label: '', quantity: '', unit: '', unit_cost: '', supplier: '' });
  }
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Budget du projet</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Détaillez les intrants et leurs coûts pour établir le besoin réel de financement.</p>
      <h3 style={{ fontSize: 'var(--fs-14)', margin: '0 0 10px' }}>Intrants et charges du projet</h3>
      <div className="grid-2">
        <div className="field"><label className="field-label">Catégorie</label><select className="input" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}><option>Semences</option><option>Engrais</option><option>Produits phytosanitaires</option><option>Main-d'œuvre</option><option>Matériel</option><option>Transport</option><option>Autre</option></select></div>
        <div className="field"><label className="field-label">Quantité</label><input className="input" type="number" min="0" value={draft.quantity} onChange={e => setDraft(d => ({ ...d, quantity: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Unité</label><input className="input" value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))} placeholder="kg, sac, jour…" /></div>
        <div className="field"><label className="field-label">Coût unitaire (FCFA)</label><input className="input" type="number" min="0" value={draft.unit_cost} onChange={e => setDraft(d => ({ ...d, unit_cost: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Fournisseur</label><input className="input" value={draft.supplier} onChange={e => setDraft(d => ({ ...d, supplier: e.target.value }))} /></div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Ajouter l'intrant</button>
      {items.map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}><span>{item.category} · {item.quantity} {item.unit}</span><span><strong>{formatCFA(Number(item.quantity) * Number(item.unit_cost))}</strong> <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems(list => list.filter(x => x.id !== item.id))}><Trash2 size={13} /></button></span></div>)}
      <div style={{ marginTop: 12, padding: 12, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-12)' }}>
        <strong>Budget :</strong> {budget == null ? 'Non calculé — ajoutez les intrants et leurs coûts' : formatCFA(budget)} ·{' '}
        <strong>Besoin net :</strong> {budget == null ? 'Non calculé' : formatCFA(Math.max(0, budget - Number(form.own_contribution || 0) - Number(form.other_funding || 0)))} ·{' '}
        <strong>Revenu estimé :</strong> {revenue == null ? 'Non calculé — renseignez surface, rendement, pertes et prix' : formatCFA(revenue)} ·{' '}
        <strong>Marge :</strong> {revenue == null || budget == null ? 'Non calculée' : formatCFA(revenue - budget)}
      </div>
    </div>
  );
}

function feasibilitySourceLabel(source = {}) {
  if (source.mode === 'hybrid') return 'Moteur local FresCoop enrichi par Teranga AI';
  if (source.mode === 'hybrid_partial') return 'Moteur local FresCoop — données Teranga partielles';
  if (source.mode === 'local_fallback') return `Moteur local FresCoop — ${feasibilityReasonMessage(source.fallback_reason)}`;
  if (source.fallback_reason === 'offline') return 'Moteur local FresCoop — navigateur hors ligne';
  if (source.fallback_reason === 'not_configured') return 'Moteur local FresCoop — Teranga non configuré';
  if (source.fallback_reason === 'insufficient_context') return 'Moteur local FresCoop — contexte insuffisant pour Teranga';
  return 'Moteur local FresCoop';
}

function firstMetric(metrics, keys) {
  for (const key of keys) {
    if (metrics?.[key] != null && Number.isFinite(Number(metrics[key]))) return Number(metrics[key]);
  }
  return null;
}

function formatYield(value, reason = '') {
  return value == null
    ? `Non calculé${reason ? ` — ${reason}` : ''}`
    : `${new Intl.NumberFormat('fr-FR').format(value)} kg/ha`;
}

function missingLabels(missing = []) {
  return missing.map(item => typeof item === 'string' ? item : item?.label).filter(Boolean);
}

function terangaYieldFromDetails(details = {}) {
  const signal = details.external_signals?.find(item => item?.type === 'yield');
  const value = signal?.predicted_yield_kg_ha;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function terangaRisk(details = {}) {
  const signal = details.external_signals?.find(item => item.type === 'risk') || {};
  return {
    score: details.risk?.safety_score ?? signal.safety_score ?? signal.score ?? null,
    level: details.risk?.level ?? signal.level ?? signal.risk_level ?? null,
    recommendation: details.risk?.recommendation ?? signal.recommendation ?? null,
  };
}

function StepFaisabiliteAgronomique({ form, items, analysis, setAnalysis }) {
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState(0);
  const project = buildProjectAssessment(form);
  const fingerprint = JSON.stringify({ project, items, city: form.applicant_location });
  const current = analysis?.fingerprint === fingerprint ? analysis.result : null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function assess() {
      setLoading(true);
      let result;
      if (!isOnline()) {
        result = buildLocalFeasibility(project, items, [], 'offline');
      } else {
        try {
          result = await api.assessAgriculturalFeasibility({
            project, input_items: items,
            context: { city: form.applicant_location },
          }, controller.signal);
        } catch (error) {
          if (error.name === 'AbortError') return;
          result = buildLocalFeasibility(project, items, [], 'unavailable');
        }
      }
      if (active) {
        setAnalysis({ fingerprint, result, updatedAt: new Date() });
        setLoading(false);
      }
    }
    assess();
    return () => { active = false; controller.abort(); };
  }, [fingerprint, run]);

  const badgeClass = current?.status === 'FEASIBLE' ? 'badge-success'
    : current?.status === 'HUMAN_REVIEW' ? 'badge-error' : 'badge-warning';
  const details = current?.details || {};
  const metrics = details.metrics || {};
  const declaredYield = firstMetric(metrics, ['declared_yield', 'expected_yield']);
  const terangaYield = terangaYieldFromDetails(details);
  const retainedYield = firstMetric(metrics, ['retained_yield']);
  const expectedVolume = firstMetric(metrics, ['expected_volume', 'retained_production', 'saleable_production']);
  const declaredRevenue = firstMetric(metrics, ['declared_revenue', 'expected_revenue']);
  const retainedRevenue = firstMetric(metrics, ['retained_revenue']);
  const revenueAdjustment = firstMetric(metrics, ['revenue_adjustment'])
    ?? (declaredRevenue != null && retainedRevenue != null ? retainedRevenue - declaredRevenue : null);
  const risk = terangaRisk(details);
  const terangaReason = terangaYield == null
    ? feasibilityReasonMessage(current?.source?.fallback_reason)
    : '';
  const missing = missingLabels(details.missing_data);
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Faisabilité agronomique</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 18 }}>
        Moteur local FresCoop + Teranga AI : le Rendement retenu alimente l’analyse du crédit. Avis explicable — décision finale humaine.
      </p>
      {loading && <div style={{ padding: 16, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)' }}>Analyse agronomique en cours…</div>}
      {!loading && current && <>
        <div style={{ padding: 18, border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
          <span className={`badge ${badgeClass}`} style={{ marginBottom: 10 }}>{current.label}</span>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{current.summary}</div>
          <div className="text-sm text-muted">{feasibilitySourceLabel(current.source)}</div>
          {current.source?.teranga?.attempted && !current.source?.teranga?.available && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius)', color: '#92400e', fontSize: 'var(--fs-11)' }}>
              Tentative Teranga échouée : {feasibilityReasonMessage(current.source.fallback_reason)}. Le moteur local FresCoop reste autoritaire et aucune pénalité n’est appliquée.
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryLine label="Rendement déclaré" value={formatYield(declaredYield, 'rendement attendu manquant')} />
          <SummaryLine label="Rendement Teranga" value={formatYield(terangaYield, terangaReason)} color="#2563eb" />
          <SummaryLine label="Rendement retenu" value={formatYield(retainedYield, 'rendement exploitable manquant')} color="#1b6b52" />
          <SummaryLine label="Volume attendu" value={expectedVolume == null ? 'Non calculé — surface, rendement ou pertes manquants' : `${new Intl.NumberFormat('fr-FR').format(expectedVolume)} kg`} />
          <SummaryLine label="Revenu déclaré" value={declaredRevenue == null ? 'Non calculé — surface, rendement, pertes ou prix manquants' : formatCFA(declaredRevenue)} />
          <SummaryLine label="Revenu retenu" value={retainedRevenue == null ? 'Non calculé — données de revenu incomplètes' : formatCFA(retainedRevenue)} color="#1b6b52" />
          <SummaryLine label="Différence de revenu" value={revenueAdjustment == null ? '—' : formatCFA(revenueAdjustment)} color={revenueAdjustment < 0 ? '#d97706' : '#1b6b52'} />
        </div>
        {(risk.score != null || risk.level || risk.recommendation) && (
          <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', marginBottom: 14, fontSize: 'var(--fs-12)' }}>
            <strong>Risque Teranga AI :</strong> {risk.level || 'niveau non précisé'}
            {risk.score != null && <> · score de sécurité {risk.score}</>}
            {risk.recommendation && <div style={{ marginTop: 4 }}>{risk.recommendation}</div>}
          </div>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRun(value => value + 1)}>
          {loading ? 'Analyse en cours…' : 'Relancer l’analyse'}
        </button>
        {analysis?.updatedAt && (
          <span className="text-sm text-muted" style={{ marginLeft: 10 }}>
            Analyse mise à jour à {analysis.updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        <details style={{ marginTop: 14, padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Voir les constats et recommandations</summary>
          <div style={{ marginTop: 12, fontSize: 'var(--fs-12)' }}>
            {missing.length > 0 && <div style={{ marginBottom: 10 }}><strong>Données à compléter :</strong> {missing.join(', ')}</div>}
            {current.report && <div style={{ marginBottom: 10 }}><strong>Rapport agronomique :</strong> <p style={{ marginTop: 5 }}>{current.report}</p></div>}
            {details.findings?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Constats :</strong><ul>{details.findings.map(item => <li key={item.code}>{item.explanation}</li>)}</ul></div>}
            {details.recommendations?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Recommandations :</strong><ul>{details.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div>}
            {details.external_signals?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Informations agricoles complémentaires :</strong><ul>{details.external_signals.map((item, index) => <li key={`${item.type}-${index}`}>{item.explanation}</li>)}</ul></div>}
            {current.source?.fallback_reason && <div className="text-muted">Teranga : {feasibilityReasonMessage(current.source.fallback_reason)}. Le résultat repose sur l’analyse FresCoop.</div>}
          </div>
        </details>
      </>}
    </div>
  );
}

function StepRevenus({ form, update }) {
  const frequencies = <><option value="hebdomadaire">Hebdomadaire</option><option value="mensuel">Mensuel</option><option value="trimestriel">Trimestriel</option><option value="saisonnier">Saisonnier</option></>;
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Revenus complémentaires</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Le revenu agricole est calculé uniquement depuis le projet agricole afin d’éviter tout double comptage.</p>
      <div className="grid-2">
        <NeantField label="Revenus commerce (FCFA / période)" value={form.revenue_commerce} onChange={v => update('revenue_commerce', v)} hint="Mettre Néant si pas de commerce" />
        <div className="field"><label className="field-label">Fréquence — commerce</label><select className="input" value={form.commerce_revenue_frequency} onChange={e => update('commerce_revenue_frequency', e.target.value)}>{frequencies}</select></div>
        <NeantField label="Autres revenus (FCFA / période)" value={form.revenue_other} onChange={v => update('revenue_other', v)} hint="Transferts, pension, etc." />
        <div className="field"><label className="field-label">Fréquence — autres revenus</label><select className="input" value={form.other_revenue_frequency} onChange={e => update('other_revenue_frequency', e.target.value)}>{frequencies}</select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Acheteur principal du projet agricole</label>
          <input className="input" value={form.main_buyer} onChange={e => update('main_buyer', e.target.value)} placeholder="Coopérative, marché, acheteur B2B..." />
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
        <NeantField label="Charges agricoles (FCFA / mois)" value={form.expenses_agriculture} onChange={v => update('expenses_agriculture', v)} hint="Semences, intrants, matériel, main-d'œuvre et transport hors budget détaillé" />
        <NeantField label="Charges du ménage (FCFA / mois)" value={form.expenses_household} onChange={v => update('expenses_household', v)} hint="Alimentation, santé, éducation, logement, cotisations et obligations sociales" />
      </div>
    </div>
  );
}

function StepDettes({ debts, setDebts }) {
  const [draft, setDraft] = useState({ institution: '', credit_type: '', source: 'DECLAREE', initial_amount: '', outstanding: '', periodic_payment: '', frequency: 'mensuel', status: 'en_cours', days_late: '', purpose: '', consent_given: false });
  function addDebt() {
    if (!draft.institution || !Number(draft.outstanding)) return;
    setDebts(list => [...list, { ...draft, id: crypto.randomUUID() }]);
    setDraft({ institution: '', credit_type: '', source: 'DECLAREE', initial_amount: '', outstanding: '', periodic_payment: '', frequency: 'mensuel', status: 'en_cours', days_late: '', purpose: '', consent_given: false });
  }
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Dettes déclarées et BIC</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>Ajoutez chaque dette séparément. La consultation BIC synthétique sera disponible sur le dossier après enregistrement d’un consentement explicite.</p>
      <div style={{ padding: 10, background: 'var(--c-warning-bg)', color: 'var(--c-warning)', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 'var(--fs-12)' }}><strong>Données synthétiques de démonstration — BIC non connecté</strong></div>
      <div className="grid-2">
        <div className="field"><label className="field-label">Institution</label><input className="input" value={draft.institution} onChange={e => setDraft(d => ({ ...d, institution: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Type de crédit</label><input className="input" value={draft.credit_type} onChange={e => setDraft(d => ({ ...d, credit_type: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Montant initial</label><input className="input" type="number" min="0" value={draft.initial_amount} onChange={e => setDraft(d => ({ ...d, initial_amount: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Encours restant *</label><input className="input" type="number" min="0" value={draft.outstanding} onChange={e => setDraft(d => ({ ...d, outstanding: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Échéance périodique</label><input className="input" type="number" min="0" value={draft.periodic_payment} onChange={e => setDraft(d => ({ ...d, periodic_payment: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Périodicité</label><select className="input" value={draft.frequency} onChange={e => setDraft(d => ({ ...d, frequency: e.target.value }))}><option value="mensuel">Mensuelle</option><option value="trimestriel">Trimestrielle</option><option value="saisonnier">Saisonnière</option></select></div>
        <div className="field"><label className="field-label">Statut</label><select className="input" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}><option value="en_cours">En cours</option><option value="retard">En retard</option><option value="termine">Terminé</option></select></div>
        <div className="field"><label className="field-label">Jours de retard</label><input className="input" type="number" min="0" value={draft.days_late} onChange={e => setDraft(d => ({ ...d, days_late: e.target.value }))} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">Objet</label><input className="input" value={draft.purpose} onChange={e => setDraft(d => ({ ...d, purpose: e.target.value }))} /></div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addDebt}><Plus size={14} /> Ajouter la dette</button>
      {debts.map(debt => <div key={debt.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}><span>{debt.institution} · encours {formatCFA(Number(debt.outstanding))} · échéance {formatCFA(Number(debt.periodic_payment))}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDebts(list => list.filter(x => x.id !== debt.id))}><Trash2 size={13} /></button></div>)}
    </div>
  );
}

function StepGaranties({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Épargne et garanties</h2>
      <div className="grid-2">
        <NeantField label="Épargne disponible (FCFA)" value={form.savings_amount} onChange={v => update('savings_amount', v)} hint="Compte épargne, tontine, etc." />
        <div className="field">
          <label className="field-label">Type de garantie principale</label>
          <select className="input" value={form.guarantee_type} onChange={e => update('guarantee_type', e.target.value)}>
            <option value="">Sélectionner une garantie</option>
            {GUARANTEE_TYPES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        {form.guarantee_type === 'Caution solidaire' && (
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">Groupe de caution solidaire</label>
            <input className="input" value={form.group_guarantee} onChange={e => update('group_guarantee', e.target.value)} placeholder="Nom du groupe et nombre de membres" />
          </div>
        )}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Garanties complémentaires</label>
          <textarea className="input" rows={2} value={form.other_guarantees} onChange={e => update('other_guarantees', e.target.value)} placeholder="Autres biens ou sûretés" />
        </div>
        <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-12)' }}><input type="checkbox" checked={form.third_party_commitment} onChange={e => update('third_party_commitment', e.target.checked)} /> Cette garantie comprend l'engagement d'un tiers</label>
        {form.third_party_commitment && <>
          <div className="field"><label className="field-label">Nom complet du garant *</label><input className="input" value={form.guarantor_name} onChange={e => update('guarantor_name', e.target.value)} /></div>
          <div className="field"><label className="field-label">N° CNI du garant *</label><input className="input" value={form.guarantor_id_number} onChange={e => update('guarantor_id_number', e.target.value)} /></div>
          <div className="field"><label className="field-label">Téléphone *</label><input className="input" type="tel" value={form.guarantor_phone} onChange={e => update('guarantor_phone', e.target.value)} /></div>
          <div className="field"><label className="field-label">Localisation / adresse</label><input className="input" value={form.guarantor_location} onChange={e => update('guarantor_location', e.target.value)} /></div>
          <div className="field"><label className="field-label">Lien avec le demandeur</label><input className="input" value={form.guarantor_relationship} onChange={e => update('guarantor_relationship', e.target.value)} /></div>
          <div className="field"><label className="field-label">Nature de l'engagement</label><input className="input" value={form.guarantor_commitment_type} onChange={e => update('guarantor_commitment_type', e.target.value)} placeholder="Caution personnelle, garantie solidaire…" /></div>
          <div className="field"><label className="field-label">Plafond de l'engagement (FCFA)</label><input className="input" type="number" min="0" value={form.guarantor_commitment_amount} onChange={e => update('guarantor_commitment_amount', e.target.value)} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-12)' }}><input type="checkbox" checked={form.guarantor_consent} onChange={e => update('guarantor_consent', e.target.checked)} /> Consentement du garant recueilli *</label>
        </>}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-11)', color: '#166534', border: '1px solid #bbf7d0' }}>
        <strong>Conseil :</strong> La caution solidaire et le nantissement de récolte sont les garanties les plus courantes en crédit agricole. Une combinaison de garanties renforce le dossier.
      </div>
    </div>
  );
}

function StepPreuves({ evidence, setEvidence }) {
  const [draft, setDraft] = useState({ category: 'projet', label: '', source: 'document', source_detail: '', verification_level: 'C', file: null });
  const [editingId, setEditingId] = useState(null);
  function chooseLevel(level) {
    setDraft(d => ({ ...d, verification_level: ['A', 'B'].includes(level) ? 'C' : level, source: level === 'D' ? 'declaration' : 'document' }));
    document.getElementById('evidence-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function saveEvidence() {
    if (!draft.label.trim()) return;
    if (draft.file && (!['application/pdf', 'image/jpeg', 'image/png'].includes(draft.file.type) || draft.file.size > 2 * 1024 * 1024)) return;
    const metadata = draft.file
      ? { file_name: draft.file.name, file_type: draft.file.type, file_size: draft.file.size, upload_pending: true }
      : (draft.metadata || {});
    const item = {
      ...draft,
      id: editingId || crypto.randomUUID(),
      metadata,
      file_reselection_required: Boolean(metadata.file_name && !draft.file),
    };
    setEvidence(list => editingId ? list.map(x => x.id === editingId ? item : x) : [...list, item]);
    setDraft({ category: 'projet', label: '', source: 'document', source_detail: '', verification_level: 'C', file: null });
    setEditingId(null);
  }
  function editEvidence(item) { setDraft({ ...item, file: null }); setEditingId(item.id); }
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Preuves du dossier</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 14 }}>Cliquez sur un niveau pour ouvrir le formulaire. Un Agent ne peut pas attribuer A ou B : un fichier non vérifié commence en C, une déclaration seule en D.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
        {['A', 'B', 'C', 'D'].map(level => <button type="button" key={level} className="btn btn-secondary" onClick={() => chooseLevel(level)} style={{ minHeight: 54 }}><strong>{level}</strong><span style={{ display: 'block', fontSize: 10 }}>{level === 'A' ? 'Interne vérifiée' : level === 'B' ? 'Externe crédible' : level === 'C' ? 'Document à vérifier' : 'Déclaration'}</span></button>)}
      </div>
      <div id="evidence-form" className="grid-2" style={{ padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)' }}>
        <div className="field"><label className="field-label">Élément concerné</label><select className="input" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}><option value="identite">Identité</option><option value="projet">Projet agricole</option><option value="revenu">Revenu</option><option value="charge">Charge</option><option value="dette">Dette</option><option value="intrant">Intrant</option><option value="parcelle">Parcelle</option><option value="garantie">Garantie</option></select></div>
        <div className="field"><label className="field-label">Niveau initial</label><input className="input" value={draft.verification_level} readOnly /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">Libellé *</label><input className="input" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Ex : reçu d'achat de semences" /></div>
        <div className="field"><label className="field-label">Source / émetteur</label><input className="input" value={draft.source_detail} onChange={e => setDraft(d => ({ ...d, source_detail: e.target.value }))} /></div>
        <div className="field"><label className="field-label">Fichier PDF, JPEG ou PNG</label><input className="input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => { const file = e.target.files?.[0] || null; if (file && file.size > 2 * 1024 * 1024) { e.target.value = ''; return; } setDraft(d => ({ ...d, file, verification_level: file ? 'C' : d.verification_level })); }} /><div className="field-hint">2 Mo maximum par fichier, 10 Mo par dossier. Envoi authentifié et empreinte SHA-256.</div></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={saveEvidence}>{editingId ? 'Enregistrer les modifications' : 'Ajouter la preuve'}</button>
      </div>
      {evidence.map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}><span><strong>{item.verification_level}</strong> · {item.label}{item.metadata?.file_name ? ` · ${item.metadata.file_name}` : ''}{item.file_reselection_required && !item.file ? <span style={{ color: 'var(--c-warning)' }}> · fichier à resélectionner</span> : ''}</span><span><button type="button" className="btn btn-ghost btn-sm" onClick={() => editEvidence(item)}><Pencil size={13} /></button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEvidence(list => list.filter(x => x.id !== item.id))}><Trash2 size={13} /></button></span></div>)}
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

function StepAnalyse({ form, items = [], debts = [] }) {
  const commerce = form.revenue_commerce === 'neant' ? 0 : Number(form.revenue_commerce) || 0;
  const other = form.revenue_other === 'neant' ? 0 : Number(form.revenue_other) || 0;
  const multiplier = frequency => ({ hebdomadaire: 52, mensuel: 12, trimestriel: 4, saisonnier: 1 }[frequency] || 1);
  const projectBudget = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
  const agriculturalRevenue = Number(form.project_surface_ha || 0) * Number(form.expected_yield || 0) * (1 - Number(form.loss_percent || 0) / 100) * Number(form.expected_price || 0);
  const totalRevAnnuel = agriculturalRevenue + commerce * multiplier(form.commerce_revenue_frequency) + other * multiplier(form.other_revenue_frequency);
  const expAgri = form.expenses_agriculture === 'neant' ? 0 : Number(form.expenses_agriculture) || 0;
  const expHousehold = form.expenses_household === 'neant' ? 0 : Number(form.expenses_household) || 0;
  const totalExpAnnuel = (expAgri + expHousehold) * 12;
  const totalDebtAnnuel = debts.reduce((sum, debt) => sum + Number(debt.periodic_payment || 0) * (debt.frequency === 'trimestriel' ? 4 : debt.frequency === 'saisonnier' ? 1 : 12), 0);
  const fluxNet = totalRevAnnuel - totalExpAnnuel - totalDebtAnnuel;
  const amount = Number(form.amount_requested) || 0;
  const duration = Number(form.duration_months) || 1;
  const echeance = amount > 0 ? Math.ceil(amount / duration) : 0;
  const calculable = Boolean(resolveCrop(form.crop_selection, form.crop_other_label).crop_label && Number(form.project_surface_ha) > 0 && Number(form.expected_yield) > 0 && Number(form.expected_price) > 0 && projectBudget > 0);

  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 8 }}>Analyse préliminaire</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Résumé calculé automatiquement. Il ne s'agit pas encore de la décision humaine du comité.
      </p>
      {!calculable && <div style={{ padding: 14, background: 'var(--c-warning-bg)', color: 'var(--c-warning)', borderRadius: 'var(--radius-md)', marginBottom: 16 }}><strong>Non calculé — données insuffisantes</strong><div className="text-sm">Complétez le rendement, le prix et le budget détaillé du projet. Aucun score numérique n'est produit.</div></div>}

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

function StepSoumission({ form, update, saving, onSave, setStep }) {
  const hasCrop = Boolean(resolveCrop(form.crop_selection, form.crop_other_label).crop_label);
  const canSubmit = form.applicant_name && form.applicant_id_number && form.amount_requested && form.credit_purpose && hasCrop && form.project_surface_ha && (!form.third_party_commitment || (form.guarantor_name && form.guarantor_id_number && form.guarantor_phone && form.guarantor_consent));

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
        <textarea className="input" rows={4} value={form.agent_note} onChange={e => update('agent_note', e.target.value)} placeholder="Observations terrain, contexte, points d'attention pour le superviseur..." />
      </div>

      <div className="flex justify-between items-center" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
        <button className="btn btn-secondary" onClick={() => setStep(5)}>
          <ArrowLeft size={14} /> Revenir en arrière
        </button>
        <button className="btn btn-primary btn-lg" onClick={onSave} disabled={saving || !canSubmit}>
          <Save size={16} /> {saving ? 'Enregistrement...' : 'Créer le dossier'}
        </button>
      </div>
    </div>
  );
}
