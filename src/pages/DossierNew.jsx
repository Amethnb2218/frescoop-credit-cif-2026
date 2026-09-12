import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { buildLocalFeasibility } from '../agriculturalFeasibilityLocal';
import { isOnline, saveDossierOffline, updateDossierOffline, getDossierOffline, addToSyncQueue } from '../lib/offline';
import { formatCFA } from '../lib/format';
import { calculateLoanTerms, buildDetailedRepaymentSchedule } from '../../shared/creditCalculations.js';
import { calculateProjectBudget } from '../lib/dossierFinance.js';
import {
  createDossierDraft,
  dossierDraftKey,
  parseDossierDraft,
} from '../lib/dossierDraft.js';
import { feasibilityReportView } from '../lib/agriculturalFeasibilityView.js';
import { Save, WifiOff, ArrowLeft, ArrowRight, MapPin, Plus, Trash2, Pencil } from 'lucide-react';

const STEPS = [
  { key: 'identification-demande', label: 'Identification/demande' },
  { key: 'projet', label: 'Projet agricole' },
  { key: 'budget-revenus', label: 'Budget/revenus' },
  { key: 'faisabilite', label: 'Faisabilité' },
  { key: 'preuves-garanties', label: 'Preuves/garanties' },
  { key: 'dettes-bic', label: 'Dettes/BIC' },
  { key: 'resume', label: 'Résumé' },
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
  const crops = form.crops?.length ? form.crops : (form.crop_name ? [{ name: form.crop_name, variety: form.crop_variety, surface_ha: num(form.project_surface_ha) }] : []);
  const modes = form.cultivation_modes?.length ? form.cultivation_modes : (form.irrigation_mode ? [form.irrigation_mode] : []);
  const loan = calculateLoanTerms(creditCalculationInput(form));
  const commerceRevenue = Number(form.revenue_commerce === 'neant' ? 0 : form.revenue_commerce || 0);
  const otherRevenue = Number(form.revenue_other === 'neant' ? 0 : form.revenue_other || 0);
  const annualCommerceRevenue = commerceRevenue * frequencyMultiplier(form.commerce_revenue_frequency);
  const annualOtherRevenue = otherRevenue * frequencyMultiplier(form.other_revenue_frequency);
  return {
    crop_code: JSON.stringify(crops), crop_label: crops.map(crop => crop.name).filter(Boolean).join(', ') || form.crop_name,
    variety: crops.map(crop => crop.variety).filter(Boolean).join(', ') || form.crop_variety,
    crop_experience_years: num(form.crop_experience_years), project_surface_ha: crops.reduce((sum, crop) => sum + Number(crop.surface_ha || 0), 0) || num(form.project_surface_ha),
    land_access: form.land_access, agro_zone: form.agro_zone, soil_type: form.soil_type,
    soil_source: form.soil_source, season: form.season, cultivation_mode: modes.join(', ') || form.irrigation_mode,
    previous_campaign_result: JSON.stringify(modes),
    water_source: form.water_source, water_reliability: form.water_reliability,
    sowing_month: form.production_cycle_start === '' ? null : Number(form.production_cycle_start) + 1,
    harvest_month: form.production_cycle_end === '' ? null : Number(form.production_cycle_end) + 1,
    expected_yield: num(form.expected_yield), expected_price: num(form.expected_price),
    loss_percent: num(form.loss_percent), own_contribution: num(form.own_contribution),
    other_funding: num(form.other_funding), climate_risks: form.climate_risks,
    mitigations: form.mitigations, market_channel: form.main_buyer,
    amount_requested: loan.principal, interest_rate: loan.interest_rate,
    interest_amount: loan.interest_amount, total_repayable: loan.total_repayable,
    total_due: loan.total_repayable, duration_months: loan.duration_months,
    desired_schedule: form.desired_schedule,
    commerce_revenue: commerceRevenue,
    commerce_revenue_frequency: form.commerce_revenue_frequency,
    annual_commerce_revenue: annualCommerceRevenue,
    other_revenue: otherRevenue,
    other_revenue_frequency: form.other_revenue_frequency,
    annual_other_revenue: annualOtherRevenue,
    annual_complementary_revenue: annualCommerceRevenue + annualOtherRevenue,
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

const INITIAL_FORM = {
  amount_requested: '', credit_purpose: '', duration_months: '', desired_schedule: '', interest_calculation_mode: 'rate', interest_rate: '', interest_amount: '',
  applicant_name: '', applicant_phone: '', applicant_id_number: '', applicant_location: '', applicant_activity: 'Agriculteur',
  sector: 'Agriculture', activity_type: '', years_experience: '', surface_ha: '', production_cycle_start: '', production_cycle_end: '', production_cycle: '',
  crop_name: '', crop_variety: '', crop_experience_years: '', project_surface_ha: '', land_access: '', agro_zone: '', soil_type: '', soil_source: '', season: '', irrigation_mode: '', water_source: '', water_reliability: '', expected_yield: '', expected_price: '', loss_percent: '', own_contribution: '', other_funding: '', climate_risks: '', mitigations: '', crops: [], cultivation_modes: [],
  revenue_commerce: '', commerce_revenue_frequency: 'mensuel', revenue_other: '', other_revenue_frequency: 'mensuel', main_buyer: '',
  expenses_agriculture: '', expenses_household: '',
  savings_amount: '', guarantee_type: '', group_guarantee: '', other_guarantees: '', third_party_commitment: false,
  guarantor_name: '', guarantor_id_number: '', guarantor_phone: '', guarantor_location: '', guarantor_relationship: '', guarantor_commitment_type: '', guarantor_commitment_amount: '', guarantor_consent: false,
  agent_note: '',
};

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function frequencyMultiplier(frequency) {
  return { hebdomadaire: 52, mensuel: 12, trimestriel: 4, semestriel: 2, saisonnier: 1, annuel: 1, 'in fine': 1, dégressif: 12 }[frequency] || 1;
}

function creditCalculationInput(form) {
  return {
    ...form,
    interest_calculation_mode: form.interest_calculation_mode === 'fixed' ? 'fixed' : 'rate',
    interest_amount: form.interest_calculation_mode === 'fixed' && form.interest_amount === '' ? 0 : form.interest_amount,
  };
}

export function loanTotals(form) {
  const terms = calculateLoanTerms(creditCalculationInput(form));
  return { principal: terms.principal, interest: terms.interest_amount, totalDue: terms.total_repayable };
}

export function repaymentEstimate(form) {
  const { terms, installments } = buildDetailedRepaymentSchedule(creditCalculationInput(form));
  const payments = installments.filter(item => item.payment > 0);
  const firstPayment = payments[0]?.payment || 0;
  const label = terms.schedule_type === 'BULLET'
    ? 'Paiement unique'
    : terms.schedule_type === 'DECLINING'
      ? 'Première échéance indicative'
      : terms.schedule_type === 'SEASONAL'
        ? 'Échéance saisonnière'
        : `Échéance ${String(form.desired_schedule || 'mensuelle').toLowerCase()}`;
  const paymentAmount = firstPayment || (terms.total_repayable > 0 ? terms.total_repayable : 0);
  return { count: payments.length || 1, installment: paymentAmount, label };
}

export const projectBudget = calculateProjectBudget;

export default function DossierNew() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const editing = Boolean(editId);
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [inputItems, setInputItems] = useState([]);
  const [declaredDebts, setDeclaredDebts] = useState([]);
  const [initialEvidence, setInitialEvidence] = useState([]);
  const [feasibilityAnalysis, setFeasibilityAnalysis] = useState(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState(null);
  const dossierIdRef = useRef(editId || crypto.randomUUID());
  const pendingServerAnalysisRef = useRef(null);
  const draftKey = dossierDraftKey(user?.id, editId);
  const feasibilityFingerprint = JSON.stringify({
    project: buildProjectAssessment(form),
    items: inputItems,
    city: form.applicant_location,
  });

  useEffect(() => {
    if (editing) return;
    const restored = parseDossierDraft(localStorage.getItem(draftKey), STEPS.length - 1);
    if (restored) {
      setForm(current => ({ ...current, ...restored.form }));
      setStep(restored.step);
      setInputItems(restored.inputItems);
      setDeclaredDebts(restored.declaredDebts);
      setInitialEvidence(restored.initialEvidence);
      setFeasibilityAnalysis(restored.feasibilityAnalysis);
      setLastDraftSavedAt(restored.savedAt);
    }
    setDraftHydrated(true);
  }, [draftKey, editing]);

  useEffect(() => {
    if (!draftHydrated) return undefined;
    const timer = window.setTimeout(() => {
      const draft = createDossierDraft({
        form, step, inputItems, declaredDebts, initialEvidence,
        feasibilityAnalysis,
      });
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setLastDraftSavedAt(new Date(draft.savedAt));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [declaredDebts, draftHydrated, draftKey, editing, feasibilityAnalysis, form, initialEvidence, inputItems, step]);

  useEffect(() => {
    if (!editing) return;
    let active = true;
    async function preload() {
      setLoading(true);
      setError('');
      try {
        let response;
        if (isOnline()) response = await api.getDossier(editId);
        else {
          const stored = await getDossierOffline(editId);
          if (!stored) throw new Error('Dossier indisponible hors connexion sur cet appareil.');
          response = {
            dossier: stored,
            project_assessment: stored.project_assessment,
            input_items: stored.input_items,
            declared_debts: stored.declared_debts,
            evidence: stored.initial_evidence,
          };
        }
        if (!active) return;
        const dossier = response.dossier || {};
        const project = response.project_assessment || dossier.project_assessment || {};
        const financialDetail = (response.cashflow || [])
          .map(entry => parseJson(entry.revenue_detail, {}))
          .find(detail => detail.derived)?.financial_inputs || dossier.financial_summary || {};
        const loanTerms = financialDetail.loan_terms || dossier.financial_summary?.loan_terms || {};
        const guarantor = (response.guarantors || [dossier.third_party_guarantor]).filter(Boolean)[0] || {};
        const storedCrops = parseJson(project.crop_code, []);
        const crops = (storedCrops.length
          ? storedCrops
          : (parseJson(project.calculated_metrics, {}).frontend_crops || dossier.crops || (project.crop_label ? [{ name: project.crop_label, variety: project.variety, surface_ha: project.project_surface_ha }] : [])))
          .map(crop => ({ ...crop, id: crop.id || crypto.randomUUID() }));
        const storedModes = parseJson(project.previous_campaign_result, []);
        const modes = storedModes.length
          ? storedModes
          : (parseJson(project.calculated_metrics, {}).frontend_cultivation_modes || dossier.cultivation_modes || String(project.cultivation_mode || '').split(',').map(mode => mode.trim()).filter(Boolean));
        setForm(current => ({
          ...current, ...dossier,
          amount_requested: dossier.amount_requested ?? '', duration_months: dossier.duration_months ?? '',
          years_experience: dossier.years_experience ?? '', surface_ha: dossier.surface_ha ?? '',
          interest_calculation_mode: dossier.interest_calculation_mode ?? loanTerms.interest_calculation_mode ?? financialDetail.interest_calculation_mode ?? 'rate',
          interest_rate: dossier.interest_rate ?? loanTerms.interest_rate ?? '', interest_amount: dossier.interest_amount ?? loanTerms.interest_amount ?? '',
          crop_name: project.crop_label || '', crop_variety: project.variety || '',
          crop_experience_years: project.crop_experience_years ?? '', project_surface_ha: project.project_surface_ha ?? '',
          land_access: project.land_access || '', agro_zone: project.agro_zone || '', soil_type: project.soil_type || '',
          soil_source: project.soil_source || '', season: project.season || '', irrigation_mode: project.cultivation_mode || '',
          water_source: project.water_source || '', water_reliability: project.water_reliability || '',
          expected_yield: project.expected_yield ?? '', expected_price: project.expected_price ?? '', loss_percent: project.loss_percent ?? '',
          own_contribution: project.own_contribution ?? '', other_funding: project.other_funding ?? '',
          climate_risks: Array.isArray(parseJson(project.climate_risks, project.climate_risks || '')) ? parseJson(project.climate_risks, []).join(', ') : (project.climate_risks || ''),
          mitigations: Array.isArray(parseJson(project.mitigations, project.mitigations || '')) ? parseJson(project.mitigations, []).join(', ') : (project.mitigations || ''),
          main_buyer: project.market_channel || project.expected_buyer || '', crops, cultivation_modes: modes,
          revenue_commerce: financialDetail.commerce_revenue ?? '', commerce_revenue_frequency: financialDetail.commerce_revenue_frequency || 'mensuel',
          revenue_other: financialDetail.other_revenue ?? '', other_revenue_frequency: financialDetail.other_revenue_frequency || 'mensuel',
          expenses_agriculture: financialDetail.agricultural_expenses ?? '', expenses_household: financialDetail.household_expenses ?? '',
          third_party_commitment: Boolean(guarantor.id || guarantor.full_name || guarantor.name),
          guarantor_name: guarantor.full_name || guarantor.name || '', guarantor_id_number: guarantor.id_number || '',
          guarantor_phone: guarantor.phone || '', guarantor_location: guarantor.location || '',
          guarantor_relationship: guarantor.relationship || '', guarantor_commitment_type: guarantor.commitment_type || '',
          guarantor_commitment_amount: guarantor.commitment_amount ?? '', guarantor_consent: Boolean(guarantor.consent_given),
        }));
        setInputItems((response.input_items || dossier.input_items || []).map(item => ({ ...item, id: item.id || crypto.randomUUID() })));
        setDeclaredDebts((response.declared_debts || dossier.declared_debts || []).map(debt => ({ ...debt, id: debt.id || crypto.randomUUID() })));
        setInitialEvidence((response.evidence || dossier.initial_evidence || []).map(item => ({ ...item, id: item.id || crypto.randomUUID() })));
        const serverAnalysis = parseJson(project.feasibility_analysis, null);
        if (serverAnalysis) pendingServerAnalysisRef.current = serverAnalysis;
        const restored = parseDossierDraft(localStorage.getItem(draftKey), STEPS.length - 1);
        if (restored) {
          setForm(current => ({ ...current, ...restored.form }));
          setStep(restored.step);
          setInputItems(restored.inputItems);
          setDeclaredDebts(restored.declaredDebts);
          setInitialEvidence(restored.initialEvidence);
          setFeasibilityAnalysis(restored.feasibilityAnalysis);
          setLastDraftSavedAt(restored.savedAt);
        }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) { setLoading(false); setDraftHydrated(true); } }
    }
    preload();
    return () => { active = false; };
  }, [editId, editing]);

  useEffect(() => {
    if (!draftHydrated || feasibilityAnalysis || !pendingServerAnalysisRef.current) return;
    const result = pendingServerAnalysisRef.current;
    pendingServerAnalysisRef.current = null;
    setFeasibilityAnalysis({
      fingerprint: feasibilityFingerprint,
      result,
      updatedAt: new Date(result.evaluated_at || Date.now()),
    });
  }, [draftHydrated, feasibilityAnalysis, feasibilityFingerprint]);

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
    if (index === 1 && (!(form.crops?.length || form.crop_name) || !(Number(form.project_surface_ha) || form.crops?.some(crop => Number(crop.surface_ha) > 0)))) return 'Renseignez au minimum une culture et la surface du projet.';
    if (index === 4 && form.third_party_commitment && (!form.guarantor_name.trim() || !form.guarantor_id_number.trim() || !form.guarantor_phone.trim() || !form.guarantor_location.trim() || !form.guarantor_relationship.trim() || !form.guarantor_commitment_type.trim() || !num(form.guarantor_commitment_amount) || !form.guarantor_consent)) return 'Complétez toutes les informations structurées et le consentement du garant tiers.';
    return '';
  }

  function nextStep() {
    const message = validateStep(step);
    if (message) { setError(message); return; }
    setError('');
    setStep(s => s + 1);
  }

  async function handleSave() {
    const validation = [0, 1, 4].map(validateStep).find(Boolean);
    if (validation) { setError(validation); return; }
    setSaving(true); setError('');
    try {
      const cycle = form.production_cycle_start !== '' && form.production_cycle_end !== ''
        ? `${MONTHS[form.production_cycle_start]} - ${MONTHS[form.production_cycle_end]}`
        : form.production_cycle;
      const commerceRevenue = Number(form.revenue_commerce === 'neant' ? 0 : form.revenue_commerce || 0);
      const otherRevenue = Number(form.revenue_other === 'neant' ? 0 : form.revenue_other || 0);
      const annualCommerceRevenue = commerceRevenue * frequencyMultiplier(form.commerce_revenue_frequency);
      const annualOtherRevenue = otherRevenue * frequencyMultiplier(form.other_revenue_frequency);
      const annualRevenue = annualCommerceRevenue + annualOtherRevenue;
      const monthlyExpenses = ['expenses_agriculture', 'expenses_household'].reduce((sum, key) => sum + Number(form[key] === 'neant' ? 0 : form[key] || 0), 0);
      const monthlyDebtPayments = declaredDebts.reduce((sum, debt) => sum + Number(debt.periodic_payment || 0), 0);
      const projectAssessment = buildProjectAssessment(form);
      const loan = calculateLoanTerms(creditCalculationInput(form));
      const budgetSummary = projectBudget(inputItems, form);
      const financialSummary = {
        interest_calculation_mode: loan.interest_calculation_mode,
        annual_revenue: annualRevenue,
        commerce_revenue: commerceRevenue, commerce_revenue_frequency: form.commerce_revenue_frequency,
        other_revenue: otherRevenue, other_revenue_frequency: form.other_revenue_frequency,
        agricultural_expenses: Number(form.expenses_agriculture === 'neant' ? 0 : form.expenses_agriculture || 0),
        household_expenses: Number(form.expenses_household === 'neant' ? 0 : form.expenses_household || 0),
        monthly_expenses: monthlyExpenses,
        monthly_debt_payments: monthlyDebtPayments,
        revenue_detail: { commerce: commerceRevenue, other: otherRevenue, annual_commerce: annualCommerceRevenue, annual_other: annualOtherRevenue },
        expenses_detail: { agriculture: Number(form.expenses_agriculture === 'neant' ? 0 : form.expenses_agriculture || 0), household: Number(form.expenses_household === 'neant' ? 0 : form.expenses_household || 0) },
        loan_terms: { interest_calculation_mode: loan.interest_calculation_mode, interest_rate: loan.interest_rate, interest_amount: loan.interest_amount, total_due: loan.total_repayable, schedule: form.desired_schedule },
        project_budget: budgetSummary,
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
        interest_calculation_mode: loan.interest_calculation_mode,
        interest_rate: loan.interest_rate,
        interest_amount: loan.interest_amount,
        total_due: loan.total_repayable,
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
        initial_evidence: initialEvidence.map(({ file, ...item }) => item),
        financial_summary: financialSummary,
      };
      if (isOnline()) {
        const res = editing ? await api.updateDossier(editId, data) : await api.createDossier(data);
        for (const item of initialEvidence) {
          if (!item.file) continue;
          await api.saveEvidenceAttachment(item.id, {
            original_name: item.file.name,
            mime_type: item.file.type,
            content_base64: await fileToBase64(item.file),
          });
        }
        localStorage.removeItem(draftKey);
        navigate(`/dossiers/${res.id || editId}`);
      } else {
        const id = data.id;
        if (editing) {
          await updateDossierOffline(id, data);
          await addToSyncQueue({ operation: 'update', entity_type: 'dossier', entity_id: id, payload: data });
        } else {
          await saveDossierOffline({ id, ...data, initial_evidence: initialEvidence, status: 'draft', agent_id: user.id, created_offline: true });
          await addToSyncQueue({ operation: 'create', entity_type: 'dossier', entity_id: id, payload: data });
        }
        for (const item of initialEvidence) {
          if (!item.file) continue;
          await addToSyncQueue({
            operation: 'attachment', entity_type: 'evidence', entity_id: item.id,
            payload: { dossier_id: id, original_name: item.file.name, mime_type: item.file.type,
              content_base64: await fileToBase64(item.file) },
          });
        }
        localStorage.removeItem(draftKey);
        navigate(editing ? `/dossiers/${id}` : '/dossiers');
      }
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="loading-state">Chargement du dossier...</div>;

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dossiers')} style={{ marginBottom: 8 }}>
          <ArrowLeft size={14} /> Retour
        </button>
        <h1 className="page-title">{editing ? 'Modifier la demande de crédit' : 'Nouvelle demande de crédit'}</h1>
        {draftHydrated && lastDraftSavedAt && (
          <p className="page-subtitle" aria-live="polite">
            Brouillon sauvegardé à {lastDraftSavedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {!isOnline() && (
          <p className="page-subtitle" style={{ color: 'var(--c-warning)' }}>
            <WifiOff size={14} style={{ verticalAlign: -2 }} /> Hors connexion — Le dossier sera synchronisé au retour du réseau
          </p>
        )}
      </div>

      <div className="form-progress" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
        <div className="form-progress-copy">
          <span className="form-progress-count">Étape {step + 1} sur {STEPS.length}</span>
          <strong className="form-progress-title">{STEPS[step].label}</strong>
        </div>
        <div className="form-progress-track" aria-hidden="true">
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="workflow-bar form-step-jump-list" aria-label="Étapes du dossier">
          {STEPS.map((s, i) => (
            <button
              type="button"
              key={s.key}
              className={`workflow-step ${i === step ? 'current' : i < step ? 'done' : ''}`}
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Étape ${i + 1} : ${s.label}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="form-step-actions">
        {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> Précédent</button> : <div />}
        {step < STEPS.length - 1
          ? <button type="button" className="btn btn-primary" onClick={nextStep}>Suivant <ArrowRight size={14} /></button>
          : <button type="button" className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving || !canSubmitDossier(form)}><Save size={16} /> {saving ? 'Enregistrement...' : editing ? 'Enregistrer les modifications' : 'Créer le dossier'}</button>}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="surface form-document">
        {step === 0 && <><StepDemandeIdentite form={form} update={update} /><div className="section-divider" /><StepActivite form={form} update={update} /></>}
        {step === 1 && <StepProjetAgricole form={form} update={update} items={inputItems} setItems={setInputItems} />}
        {step === 2 && <><StepBudgetRevenus form={form} update={update} items={inputItems} /><div className="section-divider" /><StepCharges form={form} update={update} /></>}
        {step === 3 && (
          <StepFaisabiliteAgronomique
            form={form}
            items={inputItems}
            analysis={feasibilityAnalysis}
            setAnalysis={setFeasibilityAnalysis}
          />
        )}
        {step === 4 && <><StepPreuves evidence={initialEvidence} setEvidence={setInitialEvidence} /><div className="section-divider" /><StepGaranties form={form} update={update} /></>}
        {step === 5 && <StepDettes debts={declaredDebts} setDebts={setDeclaredDebts} />}
        {step === 6 && <><StepAnalyse form={form} items={inputItems} debts={declaredDebts} /><div className="section-divider" /><StepResume form={form} update={update} items={inputItems} debts={declaredDebts} evidence={initialEvidence} /></>}
      </div>
    </div>
  );
}

function AutocompleteInput({ id, value, onChange, suggestions, placeholder, hint }) {
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef(null);
  const generatedId = useId();
  const inputId = id || generatedId;
  const listId = `${inputId}-suggestions`;

  function handleChange(v) {
    onChange(v);
    setActiveIndex(-1);
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
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      handleChange(value);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      select(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="autocomplete" ref={ref}>
      <input
        id={inputId}
        className="input"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (value.length >= 1) handleChange(value); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
      />
      {hint && <div className="field-hint">{hint}</div>}
      {open && filtered.length > 0 && (
        <div id={listId} className="autocomplete-list" role="listbox">
          {filtered.map((s, index) => (
            <button
              type="button"
              id={`${listId}-${index}`}
              key={s}
              className={`autocomplete-option ${activeIndex === index ? 'active' : ''}`}
              role="option"
              aria-selected={activeIndex === index}
              onMouseDown={event => { event.preventDefault(); select(s); }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NeantField({ id, label, value, onChange, type = 'number', hint }) {
  const generatedId = useId();
  const fieldId = id || `neant-${generatedId.replace(/:/g, '')}`;
  const isNeant = value === '0' || value === 'neant';
  return (
    <div className="field">
      <label className="field-label" htmlFor={fieldId}>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input id={fieldId} className="input" type={type} min="0" value={isNeant ? '0' : value} onChange={e => onChange(e.target.value)} style={{ flex: 1 }} disabled={value === 'neant'} />
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

function LoanFields({ form, update }) {
  const { interest, totalDue } = loanTotals(form);
  const fixedMode = form.interest_calculation_mode === 'fixed';
  return (
    <div className="grid-2" style={{ gridColumn: '1 / -1' }}>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label className="field-label" htmlFor="interest-calculation-mode">Mode de calcul des intérêts</label>
        <select id="interest-calculation-mode" className="input" value={form.interest_calculation_mode} onChange={e => update('interest_calculation_mode', e.target.value)}>
          <option value="rate">Taux annualisé</option>
          <option value="fixed">Montant fixe</option>
        </select>
      </div>
      {fixedMode
        ? <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label" htmlFor="fixed-interest-amount">Montant fixe des intérêts (FCFA)</label><input id="fixed-interest-amount" className="input" type="number" min="0" value={form.interest_amount} onChange={e => update('interest_amount', e.target.value)} placeholder="Ex : 60000" /><div className="field-hint">Le montant saisi est retenu tel quel pour toute la durée.</div></div>
        : <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label" htmlFor="annual-interest-rate">Taux d'intérêt annualisé (%)</label><input id="annual-interest-rate" className="input" type="number" min="0" step="0.01" value={form.interest_rate} onChange={e => update('interest_rate', e.target.value)} placeholder="Ex : 8" /><div className="field-hint">Les intérêts tiennent compte du taux annuel et de la durée en mois.</div></div>}
      <SummaryLine label="Intérêts retenus" value={formatCFA(interest)} />
      <SummaryLine label="Total dû" value={formatCFA(totalDue)} color="var(--c-primary)" />
    </div>
  );
}

function StepDemande({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Demande de crédit</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label" htmlFor="amount-requested">Montant demandé (FCFA) *</label>
          <input id="amount-requested" className="input" type="number" min="0" step="10000" value={form.amount_requested} onChange={e => update('amount_requested', e.target.value)} placeholder="Ex: 500000" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="duration-months">Durée souhaitée (mois) *</label>
          <input id="duration-months" className="input" type="number" min="1" max="60" value={form.duration_months} onChange={e => update('duration_months', e.target.value)} placeholder="Ex: 12" />
        </div>
        <LoanFields form={form} update={update} />
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="credit-purpose">Objet du crédit *</label>
          <textarea id="credit-purpose" className="input" rows={3} value={form.credit_purpose} onChange={e => update('credit_purpose', e.target.value)} placeholder="Décrivez précisément l'utilisation prévue du financement" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="desired-schedule">Calendrier de remboursement souhaité</label>
          <select id="desired-schedule" className="input" value={form.desired_schedule} onChange={e => update('desired_schedule', e.target.value)}>
            <option value="">Sélectionner</option>
            <option value="mensuel">Mensuel</option>
            <option value="trimestriel">Trimestriel</option>
            <option value="semestriel">Semestriel</option>
            <option value="annuel">Annuel</option>
            <option value="saisonnier">Saisonnier (post-récolte)</option>
            <option value="in fine">In fine</option>
            <option value="dégressif">Dégressif</option>
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
          <label className="field-label" htmlFor="applicant-name">Nom complet *</label>
          <input id="applicant-name" className="input" value={form.applicant_name} onChange={e => update('applicant_name', e.target.value)} placeholder="Prénom et nom" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="applicant-phone">Téléphone</label>
          <input id="applicant-phone" className="input" type="tel" value={form.applicant_phone} onChange={e => update('applicant_phone', e.target.value)} placeholder="77 xxx xx xx" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="applicant-id-number">N° CNI *</label>
          <input id="applicant-id-number" className="input" required value={form.applicant_id_number} onChange={e => update('applicant_id_number', e.target.value)} placeholder="Numéro de carte nationale d’identité" aria-describedby={!form.applicant_id_number ? 'applicant-id-error' : undefined} />
          {!form.applicant_id_number && <div id="applicant-id-error" className="field-error">Le numéro de CNI est obligatoire pour poursuivre et soumettre le dossier.</div>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="applicant-location">Localisation</label>
          <div className="field-with-action">
            <div className="field-with-action-control">
              <AutocompleteInput id="applicant-location" value={form.applicant_location} onChange={v => update('applicant_location', v)} suggestions={LOCATIONS} placeholder="Commencez à taper..." hint="Village, commune, région" />
            </div>
            <button type="button" className="btn btn-secondary btn-sm icon-button" onClick={getGPS} title="Localisation GPS actuelle" aria-label="Utiliser la localisation GPS actuelle">
              <MapPin size={14} />
            </button>
          </div>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="applicant-activity">Activité principale déclarée</label>
          <input id="applicant-activity" className="input" value="Agriculteur" readOnly aria-readonly="true" />
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
          <label className="field-label" htmlFor="applicant-sector">Filière</label>
          <input id="applicant-sector" className="input" value="Agriculture" readOnly aria-readonly="true" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="activity-type">Type d'activité</label>
          <AutocompleteInput id="activity-type" value={form.activity_type} onChange={v => update('activity_type', v)} suggestions={ACTIVITY_TYPES} placeholder="Commencez à taper..." hint="Grandes cultures, maraîchage, céréales, arachide ou horticulture" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="years-experience">Années d'expérience</label>
          <input id="years-experience" className="input" type="number" min="0" value={form.years_experience} onChange={e => update('years_experience', e.target.value)} placeholder="Ex: 5" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="surface-ha">Superficie exploitée (ha)</label>
          <input id="surface-ha" className="input" type="number" step="0.1" min="0" value={form.surface_ha} onChange={e => update('surface_ha', e.target.value)} placeholder="Ex: 2.5" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <span className="field-label" id="production-cycle-label">Cycle de production</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select id="production-cycle-start" aria-labelledby="production-cycle-label" aria-label="Mois de début du cycle de production" className="input" value={form.production_cycle_start} onChange={e => update('production_cycle_start', e.target.value)} style={{ flex: 1 }}>
              <option value="">Mois de début</option>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', fontWeight: 500 }}>à</span>
            <select id="production-cycle-end" aria-labelledby="production-cycle-label" aria-label="Mois de fin du cycle de production" className="input" value={form.production_cycle_end} onChange={e => update('production_cycle_end', e.target.value)} style={{ flex: 1 }}>
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

function StepProjetAgricole({ form, update, items, setItems }) {
  const [cropDraft, setCropDraft] = useState({ name: '', variety: '', surface_ha: '', mode: '' });
  function addCrop() {
    if (!cropDraft.name.trim() || !Number(cropDraft.surface_ha)) return;
    const next = [...(form.crops || []), { ...cropDraft, id: crypto.randomUUID() }];
    update('crops', next);
    update('crop_name', next.map(crop => crop.name).join(', '));
    update('project_surface_ha', next.reduce((sum, crop) => sum + Number(crop.surface_ha || 0), 0));
    update('cultivation_modes', [...new Set(next.map(crop => crop.mode).filter(Boolean))]);
    setCropDraft({ name: '', variety: '', surface_ha: '', mode: '' });
  }
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Projet agricole</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Ajoutez toutes les cultures et leur mode de conduite.</p>
      <div className="grid-2" style={{ padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
        <div className="field"><label className="field-label" htmlFor="crop-draft-name">Culture *</label><input id="crop-draft-name" className="input" value={cropDraft.name} onChange={e => setCropDraft(d => ({ ...d, name: e.target.value }))} placeholder="Maïs, arachide, tomate…" /></div>
        <div className="field"><label className="field-label" htmlFor="crop-draft-variety">Variété</label><input id="crop-draft-variety" className="input" value={cropDraft.variety} onChange={e => setCropDraft(d => ({ ...d, variety: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="crop-draft-surface">Surface (ha) *</label><input id="crop-draft-surface" className="input" type="number" min="0" step="0.1" value={cropDraft.surface_ha} onChange={e => setCropDraft(d => ({ ...d, surface_ha: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="crop-draft-mode">Mode</label><select id="crop-draft-mode" className="input" value={cropDraft.mode} onChange={e => setCropDraft(d => ({ ...d, mode: e.target.value }))}><option value="">Sélectionner</option><option value="pluvial">Pluvial</option><option value="irrigué">Irrigué</option><option value="mixte">Mixte</option><option value="sous serre">Sous serre</option></select></div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addCrop} disabled={!cropDraft.name.trim() || !Number(cropDraft.surface_ha)}><Plus size={14} /> Ajouter la culture</button>
      </div>
      {(form.crops || []).map(crop => <div key={crop.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}><span><strong>{crop.name}</strong>{crop.variety ? ` · ${crop.variety}` : ''} · {crop.surface_ha} ha · {crop.mode || 'mode non précisé'}</span><button type="button" className="btn btn-ghost btn-sm icon-button" onClick={() => { const next = form.crops.filter(item => item.id !== crop.id); update('crops', next); update('crop_name', next.map(item => item.name).join(', ')); update('project_surface_ha', next.reduce((sum, item) => sum + Number(item.surface_ha || 0), 0)); update('cultivation_modes', [...new Set(next.map(item => item.mode).filter(Boolean))]); }} aria-label={`Supprimer la culture ${crop.name}`} title="Supprimer cette culture"><Trash2 size={13} /></button></div>)}
      <div className="field" style={{ marginTop: 16 }}><span className="field-label" id="cultivation-modes-label">Modes de culture utilisés</span><div className="flex gap-2" role="group" aria-labelledby="cultivation-modes-label" style={{ flexWrap: 'wrap' }}>{['Pluvial', 'Irrigué', 'Mixte', 'Sous serre'].map(mode => { const selected = (form.cultivation_modes || []).includes(mode.toLowerCase()); return <button key={mode} type="button" className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={selected} onClick={() => { const value = mode.toLowerCase(); const modes = selected ? form.cultivation_modes.filter(item => item !== value) : [...(form.cultivation_modes || []), value]; update('cultivation_modes', modes); update('irrigation_mode', modes.join(', ')); }}>{mode}</button>; })}</div></div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="field"><label className="field-label" htmlFor="crop-experience-years">Expérience sur ces cultures (années)</label><input id="crop-experience-years" className="input" type="number" min="0" value={form.crop_experience_years} onChange={e => update('crop_experience_years', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="project-surface-ha">Surface totale (ha)</label><input id="project-surface-ha" className="input" value={form.project_surface_ha} readOnly /></div>
        <div className="field"><label className="field-label" htmlFor="land-access">Accès à la parcelle</label><select id="land-access" className="input" value={form.land_access} onChange={e => update('land_access', e.target.value)}><option value="">Sélectionner</option><option>Propriété</option><option>Location</option><option>Prêt familial</option><option>Parcelle communautaire</option></select></div>
        <div className="field"><label className="field-label" htmlFor="agro-zone">Zone agroécologique</label><input id="agro-zone" className="input" value={form.agro_zone} onChange={e => update('agro_zone', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="soil-type">Type / aptitude du sol</label><input id="soil-type" className="input" value={form.soil_type} onChange={e => update('soil_type', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="soil-source">Source de l'information sur le sol</label><input id="soil-source" className="input" value={form.soil_source} onChange={e => update('soil_source', e.target.value)} placeholder="Analyse, technicien, déclaration…" /></div>
        <div className="field"><label className="field-label" htmlFor="project-season">Saison</label><input id="project-season" className="input" value={form.season} onChange={e => update('season', e.target.value)} placeholder="Hivernage, saison sèche…" /></div>
        <div className="field"><label className="field-label" htmlFor="water-source">Source d'eau</label><input id="water-source" className="input" value={form.water_source} onChange={e => update('water_source', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="water-reliability">Fiabilité de l'eau</label><select id="water-reliability" className="input" value={form.water_reliability} onChange={e => update('water_reliability', e.target.value)}><option value="">Sélectionner</option><option value="sécurisée">Sécurisée</option><option value="partielle">Partielle</option><option value="incertaine">Incertaine</option></select></div>
        <div className="field"><label className="field-label" htmlFor="expected-yield">Rendement moyen (kg/ha)</label><input id="expected-yield" className="input" type="number" min="0" value={form.expected_yield} onChange={e => update('expected_yield', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="expected-price">Prix moyen (FCFA/kg)</label><input id="expected-price" className="input" type="number" min="0" value={form.expected_price} onChange={e => update('expected_price', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="loss-percent">Pertes estimées (%)</label><input id="loss-percent" className="input" type="number" min="0" max="100" value={form.loss_percent} onChange={e => update('loss_percent', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="climate-risks">Risques principaux</label><input id="climate-risks" className="input" value={form.climate_risks} onChange={e => update('climate_risks', e.target.value)} placeholder="Sécheresse, ravageurs, prix…" /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label" htmlFor="mitigations">Mesures d'atténuation</label><textarea id="mitigations" className="input" rows={2} value={form.mitigations} onChange={e => update('mitigations', e.target.value)} /></div>
      </div>
      <div style={{ borderTop: '1px solid var(--c-border)', margin: '24px 0' }} />
      <InputItemsEditor items={items} setItems={setItems} />
    </div>
  );
}

function feasibilitySourceLabel(source = {}) {
  if (source.mode === 'hybrid' || source.mode === 'hybrid_partial') {
    return 'Moteur local FresCoop + Teranga AI';
  }
  if (source.mode === 'local_offline') {
    return 'Moteur local FresCoop — hors connexion, Teranga AI sera consulté à la synchronisation';
  }
  if (source.mode === 'local_fallback' || source.fallback_used) {
    return 'Moteur local FresCoop — repli sécurisé, sans pénalité liée à Teranga AI';
  }
  return 'Moteur local FresCoop';
}

function terangaFallbackMessage(source = {}) {
  if (!source.fallback_used) return '';
  if (source.teranga?.available) {
    return 'Teranga AI a fourni une analyse partielle ; le moteur local complète les données manquantes sans appliquer de pénalité.';
  }
  if (source.fallback_reason === 'insufficient_context') {
    return 'Analyse Teranga AI en attente : renseignez la culture, la localité et le mois de semis.';
  }
  if (source.mode === 'local_offline' || source.fallback_reason === 'offline') {
    return 'Hors connexion : le moteur local reste disponible et Teranga AI sera consulté au retour du réseau.';
  }
  return 'Teranga AI est temporairement indisponible : le moteur local reste autoritaire et aucune réduction automatique n’est appliquée.';
}

function missingDataLabel(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item ?? '');
  return item.label || item.message || item.field || item.code || 'donnée à compléter';
}

function firstMetric(metrics, keys) {
  for (const key of keys) {
    if (metrics?.[key] != null && Number.isFinite(Number(metrics[key]))) return Number(metrics[key]);
  }
  return null;
}

function formatYield(value) {
  return value == null ? 'Non disponible' : `${new Intl.NumberFormat('fr-FR').format(value)} kg/ha`;
}

function terangaRisk(details = {}) {
  const signal = details.external_signals?.find(item => item.type === 'risk') || {};
  return {
    score: details.risk?.safety_score ?? signal.safety_score ?? signal.score ?? null,
    level: details.risk?.level ?? signal.level ?? signal.risk_level ?? null,
    recommendation: details.risk?.recommendation ?? signal.recommendation ?? null,
  };
}

function InputItemsEditor({ items, setItems }) {
  const categories = ['Semences', 'Engrais', 'Phytos', 'Matériel', "Main-d’œuvre", 'Transport', 'Autres'];
  function addCategoryLine(category) {
    setItems(list => [...list, { id: crypto.randomUUID(), category, label: category, quantity: '', unit: '', unit_cost: '', supplier: '' }]);
  }
  function updateItem(id, field, value) {
    setItems(list => list.map(item => item.id === id ? { ...item, [field]: value } : item));
  }
  return (
    <div>
      <h3 style={{ fontSize: 'var(--fs-15)', fontWeight: 600, marginBottom: 6 }}>Besoins et intrants détaillés</h3>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Ajoutez chaque besoin du projet par catégorie.</p>
      {categories.map(category => {
        const categoryItems = items.filter(item => item.category === category);
        const subtotal = categoryItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0);
        return <section key={category} className="input-category">
          <div className="input-category-header"><strong>{category}</strong><button type="button" className="btn btn-secondary btn-sm" onClick={() => addCategoryLine(category)}><Plus size={13} /> Ligne</button></div>
          {categoryItems.length === 0 ? <div className="text-xs text-muted">Aucun besoin renseigné.</div> : categoryItems.map((item, index) => {
            const prefix = `input-${item.id}`;
            return <div key={item.id} className="input-item-row">
              <div className="input-item-field"><label className="field-label" htmlFor={`${prefix}-label`}>Désignation</label><input id={`${prefix}-label`} className="input" value={item.label === category ? '' : item.label || ''} onChange={e => updateItem(item.id, 'label', e.target.value || category)} placeholder="Désignation" /></div>
              <div className="input-item-field"><label className="field-label" htmlFor={`${prefix}-quantity`}>Quantité</label><input id={`${prefix}-quantity`} className="input" type="number" min="0" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', e.target.value)} placeholder="Quantité" /></div>
              <div className="input-item-field"><label className="field-label" htmlFor={`${prefix}-unit`}>Unité</label><input id={`${prefix}-unit`} className="input" value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} placeholder="Unité" /></div>
              <div className="input-item-field"><label className="field-label" htmlFor={`${prefix}-cost`}>Coût unitaire</label><input id={`${prefix}-cost`} className="input" type="number" min="0" value={item.unit_cost} onChange={e => updateItem(item.id, 'unit_cost', e.target.value)} placeholder="Coût unitaire" /></div>
              <div className="input-item-field"><label className="field-label" htmlFor={`${prefix}-supplier`}>Fournisseur</label><input id={`${prefix}-supplier`} className="input" value={item.supplier} onChange={e => updateItem(item.id, 'supplier', e.target.value)} placeholder="Fournisseur" /></div>
              <button type="button" className="btn btn-ghost btn-sm icon-button input-item-delete" onClick={() => setItems(list => list.filter(current => current.id !== item.id))} aria-label={`Supprimer la ligne ${index + 1} de ${category}`} title="Supprimer cette ligne"><Trash2 size={13} /></button>
            </div>;
          })}
          <div className="input-category-subtotal">Sous-total : <strong>{formatCFA(subtotal)}</strong></div>
        </section>;
      })}
    </div>
  );
}

function StepBudgetRevenus({ form, update, items }) {
  const budget = projectBudget(items, form);
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 6 }}>Budget et revenus</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>Résumé calculé depuis les besoins détaillés du projet agricole.</p>
      <div className="grid-2">
        <div className="field"><label className="field-label" htmlFor="own-contribution">Apport personnel (FCFA)</label><input id="own-contribution" className="input" type="number" min="0" value={form.own_contribution} onChange={e => update('own_contribution', e.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="other-funding">Autres financements (FCFA)</label><input id="other-funding" className="input" type="number" min="0" value={form.other_funding} onChange={e => update('other_funding', e.target.value)} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: '16px 0' }}>
        <SummaryLine label="Budget total" value={formatCFA(budget.total)} />
        <SummaryLine label="Besoin réel" value={formatCFA(budget.realNeed)} />
        <SummaryLine label="Surfinancement" value={formatCFA(budget.overfinancing)} color={budget.overfinancing ? 'var(--c-danger)' : 'var(--c-success)'} />
        <SummaryLine label="Montant conseillé" value={formatCFA(budget.advisedAmount)} color="var(--c-primary)" />
      </div>
      <StepRevenus form={form} update={update} />
    </div>
  );
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
          result = buildLocalFeasibility(project, items, [], 'request_failed');
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
  const terangaYield = firstMetric(metrics, ['teranga_yield', 'predicted_yield_kg_ha']);
  const retainedYield = firstMetric(metrics, ['retained_yield']) ?? declaredYield;
  const declaredRevenue = firstMetric(metrics, ['declared_revenue', 'expected_revenue']);
  const retainedRevenue = firstMetric(metrics, ['retained_revenue']) ?? declaredRevenue;
  const revenueAdjustment = firstMetric(metrics, ['revenue_adjustment'])
    ?? (declaredRevenue != null && retainedRevenue != null ? retainedRevenue - declaredRevenue : null);
  const risk = terangaRisk(details);
  const reportView = feasibilityReportView(current || {});
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
          {current.source?.fallback_used && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius)', color: '#92400e', fontSize: 'var(--fs-11)' }}>
              {terangaFallbackMessage(current.source)}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginBottom: 14 }}>
          <SummaryLine label="Rendement" value={formatYield(declaredYield)} />
          <SummaryLine label="Rendement Teranga" value={formatYield(terangaYield)} color="#2563eb" />
          <SummaryLine label="Rendement retenu" value={formatYield(retainedYield)} color="#1b6b52" />
          <SummaryLine label="Revenu déclaré" value={declaredRevenue == null ? '—' : formatCFA(declaredRevenue)} />
          <SummaryLine label="Revenu retenu" value={retainedRevenue == null ? '—' : formatCFA(retainedRevenue)} color="#1b6b52" />
          <SummaryLine label="Différence de revenu" value={revenueAdjustment == null ? '—' : formatCFA(revenueAdjustment)} color={revenueAdjustment < 0 ? '#d97706' : '#1b6b52'} />
        </div>
        {(risk.score != null || risk.level || risk.recommendation) && (
          <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', marginBottom: 14, fontSize: 'var(--fs-12)' }}>
            <strong>Signaux Teranga — rendement et risque</strong>
            <div>{risk.level || 'niveau non précisé'}{risk.score != null && <> · score de sécurité {risk.score}</>}</div>
            {risk.recommendation && <div style={{ marginTop: 4 }}>{risk.recommendation}</div>}
          </div>
        )}
        <div style={{ padding: 14, border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
          <strong>Analyse déterministe FresCoop</strong>
          <div className="text-sm" style={{ marginTop: 6, lineHeight: 1.6 }}>
            {reportView.deterministicNarrative || current.summary || 'Analyse déterministe disponible dans les constats ci-dessous.'}
          </div>
        </div>
        <div style={{ padding: 14, border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)', marginBottom: 14 }}>
          <strong>Rapport du conseiller Teranga AI</strong>
          <div className="text-sm" style={{ marginTop: 6, lineHeight: 1.6 }}>
            {reportView.terangaNarrative || 'Le conseiller Teranga AI n’a pas fourni de réponse narrative valide.'}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 8 }}>
            Source : {reportView.teranga.source || 'non fournie'} · Modèle : {reportView.teranga.model || 'non fourni'} · Disponibilité : {reportView.teranga.available ? 'disponible' : 'indisponible'} · État : {reportView.teranga.partial ? 'partiel' : reportView.teranga.degraded ? 'dégradé' : 'complet ou non précisé'}
          </div>
          {reportView.teranga.notice && <div className="text-xs text-muted" style={{ marginTop: 4 }}>{reportView.teranga.notice}</div>}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRun(value => value + 1)}>
          {loading ? 'Analyse en cours…' : 'Relancer l’analyse'}
        </button>
        {analysis?.updatedAt && (
          <span className="text-sm text-muted" style={{ marginLeft: 10 }}>
            Analyse mise à jour à {new Date(analysis.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
        <details style={{ marginTop: 14, padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Voir les constats et recommandations</summary>
          <div style={{ marginTop: 12, fontSize: 'var(--fs-12)' }}>
            {details.missing_data?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Données manquantes :</strong> {details.missing_data.map(missingDataLabel).filter(Boolean).join(', ')}</div>}
            {details.findings?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Constats :</strong><ul>{details.findings.map(item => <li key={item.code}>{item.explanation}</li>)}</ul></div>}
            {details.recommendations?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Recommandations :</strong><ul>{details.recommendations.map(item => <li key={item}>{item}</li>)}</ul></div>}
            {details.external_signals?.length > 0 && <div style={{ marginBottom: 10 }}><strong>Informations agricoles complémentaires :</strong><ul>{details.external_signals.map((item, index) => <li key={`${item.type}-${index}`}>{item.explanation}</li>)}</ul></div>}
            {current.source?.fallback_reason && <div className="text-muted">Certaines données externes ne sont pas disponibles ; le résultat repose sur l’analyse FresCoop.</div>}
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
        <NeantField id="revenue-commerce" label="Revenus commerce (FCFA / période)" value={form.revenue_commerce} onChange={v => update('revenue_commerce', v)} hint="Mettre Néant si pas de commerce" />
        <div className="field"><label className="field-label" htmlFor="commerce-revenue-frequency">Fréquence — commerce</label><select id="commerce-revenue-frequency" className="input" value={form.commerce_revenue_frequency} onChange={e => update('commerce_revenue_frequency', e.target.value)}>{frequencies}</select></div>
        <NeantField id="revenue-other" label="Autres revenus (FCFA / période)" value={form.revenue_other} onChange={v => update('revenue_other', v)} hint="Transferts, pension, etc." />
        <div className="field"><label className="field-label" htmlFor="other-revenue-frequency">Fréquence — autres revenus</label><select id="other-revenue-frequency" className="input" value={form.other_revenue_frequency} onChange={e => update('other_revenue_frequency', e.target.value)}>{frequencies}</select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="main-buyer">Acheteur principal du projet agricole</label>
          <input id="main-buyer" className="input" value={form.main_buyer} onChange={e => update('main_buyer', e.target.value)} placeholder="Coopérative, marché, acheteur B2B..." />
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
        <NeantField id="expenses-agriculture" label="Charges agricoles (FCFA / mois)" value={form.expenses_agriculture} onChange={v => update('expenses_agriculture', v)} hint="Semences, intrants, matériel, main-d'œuvre et transport hors budget détaillé" />
        <NeantField id="expenses-household" label="Charges du ménage (FCFA / mois)" value={form.expenses_household} onChange={v => update('expenses_household', v)} hint="Alimentation, santé, éducation, logement, cotisations et obligations sociales" />
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
        <div className="field"><label className="field-label" htmlFor="debt-institution">Institution</label><input id="debt-institution" className="input" value={draft.institution} onChange={e => setDraft(d => ({ ...d, institution: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="debt-credit-type">Type de crédit</label><input id="debt-credit-type" className="input" value={draft.credit_type} onChange={e => setDraft(d => ({ ...d, credit_type: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="debt-initial-amount">Montant initial</label><input id="debt-initial-amount" className="input" type="number" min="0" value={draft.initial_amount} onChange={e => setDraft(d => ({ ...d, initial_amount: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="debt-outstanding">Encours restant *</label><input id="debt-outstanding" className="input" type="number" min="0" value={draft.outstanding} onChange={e => setDraft(d => ({ ...d, outstanding: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="debt-periodic-payment">Échéance périodique</label><input id="debt-periodic-payment" className="input" type="number" min="0" value={draft.periodic_payment} onChange={e => setDraft(d => ({ ...d, periodic_payment: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="debt-frequency">Périodicité</label><select id="debt-frequency" className="input" value={draft.frequency} onChange={e => setDraft(d => ({ ...d, frequency: e.target.value }))}><option value="mensuel">Mensuelle</option><option value="trimestriel">Trimestrielle</option><option value="saisonnier">Saisonnière</option></select></div>
        <div className="field"><label className="field-label" htmlFor="debt-status">Statut</label><select id="debt-status" className="input" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}><option value="en_cours">En cours</option><option value="retard">En retard</option><option value="termine">Terminé</option></select></div>
        <div className="field"><label className="field-label" htmlFor="debt-days-late">Jours de retard</label><input id="debt-days-late" className="input" type="number" min="0" value={draft.days_late} onChange={e => setDraft(d => ({ ...d, days_late: e.target.value }))} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label" htmlFor="debt-purpose">Objet</label><input id="debt-purpose" className="input" value={draft.purpose} onChange={e => setDraft(d => ({ ...d, purpose: e.target.value }))} /></div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={addDebt}><Plus size={14} /> Ajouter la dette</button>
      {debts.map(debt => <div key={debt.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}><span>{debt.institution} · encours {formatCFA(Number(debt.outstanding))} · échéance {formatCFA(Number(debt.periodic_payment))}</span><button type="button" className="btn btn-ghost btn-sm icon-button" onClick={() => setDebts(list => list.filter(x => x.id !== debt.id))} aria-label={`Supprimer la dette auprès de ${debt.institution}`} title="Supprimer cette dette"><Trash2 size={13} /></button></div>)}
    </div>
  );
}

function StepGaranties({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Épargne et garanties</h2>
      <div className="grid-2">
        <NeantField id="savings-amount" label="Épargne disponible (FCFA)" value={form.savings_amount} onChange={v => update('savings_amount', v)} hint="Compte épargne, tontine, etc." />
        <div className="field">
          <label className="field-label" htmlFor="guarantee-type">Type de garantie principale</label>
          <select id="guarantee-type" className="input" value={form.guarantee_type} onChange={e => update('guarantee_type', e.target.value)}>
            <option value="">Sélectionner une garantie</option>
            {GUARANTEE_TYPES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        {form.guarantee_type === 'Caution solidaire' && (
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label className="field-label" htmlFor="group-guarantee">Groupe de caution solidaire</label>
            <input id="group-guarantee" className="input" value={form.group_guarantee} onChange={e => update('group_guarantee', e.target.value)} placeholder="Nom du groupe et nombre de membres" />
          </div>
        )}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="other-guarantees">Garanties complémentaires</label>
          <textarea id="other-guarantees" className="input" rows={2} value={form.other_guarantees} onChange={e => update('other_guarantees', e.target.value)} placeholder="Autres biens ou sûretés" />
        </div>
        <label htmlFor="third-party-commitment" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-12)' }}><input id="third-party-commitment" type="checkbox" checked={form.third_party_commitment} onChange={e => update('third_party_commitment', e.target.checked)} /> Cette garantie comprend l'engagement d'un tiers</label>
        {form.third_party_commitment && <>
          <div className="field"><label className="field-label" htmlFor="guarantor-name">Nom complet du garant *</label><input id="guarantor-name" className="input" value={form.guarantor_name} onChange={e => update('guarantor_name', e.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="guarantor-id-number">N° CNI du garant *</label><input id="guarantor-id-number" className="input" value={form.guarantor_id_number} onChange={e => update('guarantor_id_number', e.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="guarantor-phone">Téléphone *</label><input id="guarantor-phone" className="input" type="tel" value={form.guarantor_phone} onChange={e => update('guarantor_phone', e.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="guarantor-location">Localisation / adresse</label><input id="guarantor-location" className="input" value={form.guarantor_location} onChange={e => update('guarantor_location', e.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="guarantor-relationship">Lien avec le demandeur</label><input id="guarantor-relationship" className="input" value={form.guarantor_relationship} onChange={e => update('guarantor_relationship', e.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="guarantor-commitment-type">Nature de l'engagement</label><input id="guarantor-commitment-type" className="input" value={form.guarantor_commitment_type} onChange={e => update('guarantor_commitment_type', e.target.value)} placeholder="Caution personnelle, garantie solidaire…" /></div>
          <div className="field"><label className="field-label" htmlFor="guarantor-commitment-amount">Plafond de l'engagement (FCFA)</label><input id="guarantor-commitment-amount" className="input" type="number" min="0" value={form.guarantor_commitment_amount} onChange={e => update('guarantor_commitment_amount', e.target.value)} /></div>
          <label htmlFor="guarantor-consent" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-12)' }}><input id="guarantor-consent" type="checkbox" checked={form.guarantor_consent} onChange={e => update('guarantor_consent', e.target.checked)} /> Consentement du garant recueilli *</label>
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
    const item = { ...draft, id: editingId || crypto.randomUUID(), metadata: draft.file ? { file_name: draft.file.name, file_type: draft.file.type, file_size: draft.file.size, upload_pending: true } : (draft.metadata || {}), file_reselection_required: Boolean(draft.metadata?.file_name && !draft.file) };
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
        <div className="field"><label className="field-label" htmlFor="evidence-category">Élément concerné</label><select id="evidence-category" className="input" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}><option value="identite">Identité</option><option value="projet">Projet agricole</option><option value="revenu">Revenu</option><option value="charge">Charge</option><option value="dette">Dette</option><option value="intrant">Intrant</option><option value="parcelle">Parcelle</option><option value="garantie">Garantie</option></select></div>
        <div className="field"><label className="field-label" htmlFor="evidence-level">Niveau initial</label><input id="evidence-level" className="input" value={draft.verification_level} readOnly /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label" htmlFor="evidence-label">Libellé *</label><input id="evidence-label" className="input" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Ex : reçu d'achat de semences" /></div>
        <div className="field"><label className="field-label" htmlFor="evidence-source-detail">Source / émetteur</label><input id="evidence-source-detail" className="input" value={draft.source_detail} onChange={e => setDraft(d => ({ ...d, source_detail: e.target.value }))} /></div>
        <div className="field"><label className="field-label" htmlFor="evidence-file">Fichier PDF, JPEG ou PNG</label><input id="evidence-file" className="input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => { const file = e.target.files?.[0] || null; if (file && file.size > 2 * 1024 * 1024) { e.target.value = ''; return; } setDraft(d => ({ ...d, file, verification_level: file ? 'C' : d.verification_level })); }} /><div className="field-hint">2 Mo maximum par fichier, 10 Mo par dossier. Envoi authentifié et empreinte SHA-256.</div></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={saveEvidence}>{editingId ? 'Enregistrer les modifications' : 'Ajouter la preuve'}</button>
      </div>
      {evidence.map(item => <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}><span><strong>{item.verification_level}</strong> · {item.label}{item.metadata?.file_name ? ` · ${item.metadata.file_name}` : ''}{item.file_reselection_required ? ' · fichier à resélectionner' : ''}</span><span><button type="button" className="btn btn-ghost btn-sm icon-button" onClick={() => editEvidence(item)} aria-label={`Modifier la preuve ${item.label}`} title="Modifier cette preuve"><Pencil size={13} /></button><button type="button" className="btn btn-ghost btn-sm icon-button" onClick={() => setEvidence(list => list.filter(x => x.id !== item.id))} aria-label={`Supprimer la preuve ${item.label}`} title="Supprimer cette preuve"><Trash2 size={13} /></button></span></div>)}
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
  const loanSchedule = buildDetailedRepaymentSchedule(creditCalculationInput(form));
  const amount = loanSchedule.terms.principal;
  const interest = loanSchedule.terms.interest_amount;
  const totalCredit = loanSchedule.terms.total_repayable;
  const repayment = repaymentEstimate(form);
  const annualCreditService = loanSchedule.installments.slice(0, 12).reduce((sum, installment) => sum + installment.payment, 0);
  const calculable = Boolean(form.crop_name && Number(form.project_surface_ha) > 0 && Number(form.expected_yield) > 0 && Number(form.expected_price) > 0 && projectBudget > 0);

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
          <span className="font-semibold">{loanSchedule.terms.duration_months || '—'} mois</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 'var(--fs-12)' }}>
          <span className="text-muted">Intérêts estimés</span>
          <span className="font-semibold">{formatCFA(interest)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 'var(--fs-12)' }}>
          <span className="text-muted">Capital + intérêts</span>
          <span className="font-semibold">{formatCFA(totalCredit)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-12)' }}>
          <span className="text-muted">{repayment.label}</span>
          <span className="font-semibold">{formatCFA(repayment.installment)} × {repayment.count}</span>
        </div>
      </div>

      {totalCredit > 0 && fluxNet > 0 && (
        <div style={{ padding: 12, borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-12)', background: annualCreditService <= fluxNet ? 'var(--c-success-bg)' : 'var(--c-warning-bg)', color: annualCreditService <= fluxNet ? 'var(--c-success)' : 'var(--c-warning)' }}>
          {annualCreditService <= fluxNet
            ? 'Le flux net annuel estimé couvre les échéances annuelles.'
            : 'Attention : le flux net estimé pourrait ne pas couvrir toutes les échéances. Un calendrier saisonnier peut être envisagé.'}
        </div>
      )}
    </div>
  );
}

function canSubmitDossier(form) {
  return Boolean(form.applicant_name && form.applicant_id_number && form.amount_requested && form.credit_purpose && (form.crops?.length || form.crop_name) && (!form.third_party_commitment || (form.guarantor_name && form.guarantor_id_number && form.guarantor_phone && form.guarantor_consent)));
}

function StepResume({ form, update, items, debts, evidence }) {
  const loan = loanTotals(form);
  const repayment = repaymentEstimate(form);
  const budget = projectBudget(items, form);
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-16)', fontWeight: 600, marginBottom: 16 }}>Résumé de la demande</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
        <SummaryLine label="Demandeur" value={form.applicant_name || '—'} />
        <SummaryLine label="Cultures" value={(form.crops || []).map(crop => crop.name).join(', ') || form.crop_name || '—'} />
        <SummaryLine label="Budget total" value={formatCFA(budget.total)} />
        <SummaryLine label="Besoin réel" value={formatCFA(budget.realNeed)} />
        <SummaryLine label="Montant conseillé" value={formatCFA(budget.advisedAmount)} color="var(--c-primary)" />
        <SummaryLine label="Surfinancement" value={formatCFA(budget.overfinancing)} color={budget.overfinancing ? 'var(--c-danger)' : 'var(--c-success)'} />
        <SummaryLine label="Capital demandé" value={formatCFA(loan.principal)} />
        <SummaryLine label="Intérêts retenus" value={formatCFA(loan.interest)} />
        <SummaryLine label="Total dû" value={formatCFA(loan.totalDue)} color="var(--c-primary)" />
        <SummaryLine label={repayment.label} value={`${formatCFA(repayment.installment)} × ${repayment.count}`} />
        <SummaryLine label="Preuves" value={`${evidence.length}`} />
        <SummaryLine label="Dettes déclarées" value={`${debts.length}`} />
      </div>
      <div className="field"><label className="field-label" htmlFor="agent-note">Note de l'agent</label><textarea id="agent-note" className="input" rows={4} value={form.agent_note} onChange={e => update('agent_note', e.target.value)} placeholder="Observations terrain et points d'attention…" /></div>
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
