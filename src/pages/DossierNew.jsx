import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { isOnline, saveDossierOffline, addToSyncQueue } from '../lib/offline';
import { Save, WifiOff, ArrowLeft, ArrowRight } from 'lucide-react';

const STEPS = [
  { key: 'identity', label: 'Identité' },
  { key: 'activity', label: 'Activité' },
  { key: 'credit', label: 'Demande' },
  { key: 'guarantees', label: 'Garanties' },
];

export default function DossierNew() {
  const navigate = useNavigate();
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    applicant_name: '', applicant_phone: '', applicant_id_number: '',
    applicant_location: '', applicant_activity: '',
    sector: 'Agriculture', activity_type: '', years_experience: '',
    surface_ha: '', production_cycle: '',
    amount_requested: '', credit_purpose: '', duration_months: '',
    desired_schedule: '', savings_amount: '', guarantee_type: '',
    group_guarantee: '', other_guarantees: '', agent_note: '',
  });

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        ...form,
        amount_requested: form.amount_requested ? Number(form.amount_requested) : null,
        duration_months: form.duration_months ? Number(form.duration_months) : null,
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        surface_ha: form.surface_ha ? Number(form.surface_ha) : null,
        savings_amount: form.savings_amount ? Number(form.savings_amount) : null,
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
          <button key={s.key} className={`workflow-step ${i === step ? 'current' : i < step ? 'done' : ''}`} onClick={() => setStep(i)}>
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <div className="surface">
        {step === 0 && <StepIdentity form={form} update={update} />}
        {step === 1 && <StepActivity form={form} update={update} />}
        {step === 2 && <StepCredit form={form} update={update} />}
        {step === 3 && <StepGuarantees form={form} update={update} />}

        <div className="flex justify-between items-center" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--c-200)' }}>
          {step > 0 ? <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}><ArrowLeft size={14} /> Précédent</button> : <div />}
          {step < 3 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Suivant <ArrowRight size={14} /></button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving || !form.applicant_name}>
              <Save size={16} /> {saving ? 'Enregistrement...' : 'Créer le dossier'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIdentity({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 20 }}>Identité du demandeur</h2>
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
          <label className="field-label">Activité principale</label>
          <input className="input" value={form.applicant_activity} onChange={e => update('applicant_activity', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function StepActivity({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 20 }}>Activité agricole</h2>
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
          <div className="field-hint">Ex: Maraîchage, Riziculture, Aviculture</div>
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
          <div className="field-hint">Ex: Oct-Mars (6 mois), Continu, Juil-Déc</div>
        </div>
      </div>
    </div>
  );
}

function StepCredit({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 20 }}>Demande de crédit</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Montant demandé (FCFA) *</label>
          <input className="input" type="number" min="0" step="10000" value={form.amount_requested} onChange={e => update('amount_requested', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Durée souhaitée (mois)</label>
          <input className="input" type="number" min="1" max="60" value={form.duration_months} onChange={e => update('duration_months', e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Objet du crédit</label>
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

function StepGuarantees({ form, update }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 20 }}>Garanties et observations</h2>
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
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Autres garanties</label>
          <textarea className="input" rows={2} value={form.other_guarantees} onChange={e => update('other_guarantees', e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Note de l'agent</label>
          <textarea className="input" rows={3} value={form.agent_note} onChange={e => update('agent_note', e.target.value)} />
          <div className="field-hint">Observations terrain, contexte, points d'attention pour le superviseur</div>
        </div>
      </div>
    </div>
  );
}
