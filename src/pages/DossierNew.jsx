import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { isOnline, saveDossierOffline, addToSyncQueue } from '../lib/offline';
import { Save, WifiOff } from 'lucide-react';

export default function DossierNew() {
  const navigate = useNavigate();
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    applicant_name: '', applicant_phone: '', applicant_id_number: '',
    applicant_location: '', applicant_activity: '',
    sector: 'Agriculture', activity_type: '', years_experience: '',
    surface_ha: '', production_cycle: '',
    amount_requested: '', credit_purpose: '', duration_months: '',
    desired_schedule: '', savings_amount: '', guarantee_type: '',
    group_guarantee: '', other_guarantees: '', agent_note: '',
  });

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

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
        navigate(`/dossiers`);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const steps = ['Identité', 'Activité', 'Crédit', 'Garanties'];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>Nouveau dossier de crédit</h1>
      {!isOnline() && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d97706', fontSize: '0.85rem', marginBottom: 16 }}>
          <WifiOff size={16} /> Mode hors ligne — le dossier sera synchronisé au retour du réseau
        </div>
      )}

      <div className="workflow-steps">
        {steps.map((s, i) => (
          <button key={i} className={`workflow-step ${step === i + 1 ? 'current' : step > i + 1 ? 'done' : ''}`} onClick={() => setStep(i + 1)}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div className="card">
        {step === 1 && (
          <div>
            <h2 className="card-title" style={{ marginBottom: 16 }}>Identité du demandeur</h2>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Nom complet *</label>
                <input className="form-input" value={form.applicant_name} onChange={e => update('applicant_name', e.target.value)} placeholder="Prénom et nom" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input className="form-input" value={form.applicant_phone} onChange={e => update('applicant_phone', e.target.value)} placeholder="+221 7X XXX XX XX" />
              </div>
              <div className="form-group">
                <label className="form-label">N° pièce d'identité</label>
                <input className="form-input" value={form.applicant_id_number} onChange={e => update('applicant_id_number', e.target.value)} placeholder="CNI / Passeport" />
              </div>
              <div className="form-group">
                <label className="form-label">Localisation</label>
                <input className="form-input" value={form.applicant_location} onChange={e => update('applicant_location', e.target.value)} placeholder="Village, Commune, Région" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Activité principale</label>
                <input className="form-input" value={form.applicant_activity} onChange={e => update('applicant_activity', e.target.value)} placeholder="Ex: Maraîchage tomates" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="card-title" style={{ marginBottom: 16 }}>Activité agricole</h2>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Filière</label>
                <select className="form-input form-select" value={form.sector} onChange={e => update('sector', e.target.value)}>
                  <option value="Agriculture">Agriculture</option>
                  <option value="Élevage">Élevage</option>
                  <option value="Pêche">Pêche</option>
                  <option value="Transformation">Transformation</option>
                  <option value="Commerce agricole">Commerce agricole</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type d'activité</label>
                <input className="form-input" value={form.activity_type} onChange={e => update('activity_type', e.target.value)} placeholder="Ex: Maraîchage, Riziculture..." />
              </div>
              <div className="form-group">
                <label className="form-label">Années d'expérience</label>
                <input className="form-input" type="number" value={form.years_experience} onChange={e => update('years_experience', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Superficie (ha)</label>
                <input className="form-input" type="number" step="0.1" value={form.surface_ha} onChange={e => update('surface_ha', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Cycle de production</label>
                <input className="form-input" value={form.production_cycle} onChange={e => update('production_cycle', e.target.value)} placeholder="Ex: Oct-Mars (6 mois)" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="card-title" style={{ marginBottom: 16 }}>Demande de crédit</h2>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Montant demandé (FCFA) *</label>
                <input className="form-input" type="number" value={form.amount_requested} onChange={e => update('amount_requested', e.target.value)} placeholder="1500000" />
              </div>
              <div className="form-group">
                <label className="form-label">Durée souhaitée (mois)</label>
                <input className="form-input" type="number" value={form.duration_months} onChange={e => update('duration_months', e.target.value)} placeholder="10" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Objet du crédit</label>
                <textarea className="form-input" rows={3} value={form.credit_purpose} onChange={e => update('credit_purpose', e.target.value)} placeholder="Ex: Achat intrants et semences améliorées pour campagne maraîchère" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Calendrier de remboursement souhaité</label>
                <select className="form-input form-select" value={form.desired_schedule} onChange={e => update('desired_schedule', e.target.value)}>
                  <option value="">Sélectionner</option>
                  <option value="Mensuel classique">Mensuel classique</option>
                  <option value="Saisonnier (post-récolte)">Saisonnier (post-récolte)</option>
                  <option value="Trimestriel">Trimestriel</option>
                  <option value="In fine">In fine (capital à échéance)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="card-title" style={{ marginBottom: 16 }}>Garanties</h2>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Épargne disponible (FCFA)</label>
                <input className="form-input" type="number" value={form.savings_amount} onChange={e => update('savings_amount', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Type de garantie</label>
                <select className="form-input form-select" value={form.guarantee_type} onChange={e => update('guarantee_type', e.target.value)}>
                  <option value="">Sélectionner</option>
                  <option value="Caution solidaire">Caution solidaire groupe</option>
                  <option value="Nantissement">Nantissement (récolte, équipement)</option>
                  <option value="Épargne bloquée">Épargne bloquée</option>
                  <option value="Mixte">Mixte</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Groupe de caution solidaire</label>
                <input className="form-input" value={form.group_guarantee} onChange={e => update('group_guarantee', e.target.value)} placeholder="Nom du groupe et nombre de membres" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Autres garanties</label>
                <textarea className="form-input" rows={2} value={form.other_guarantees} onChange={e => update('other_guarantees', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Note de l'agent</label>
                <textarea className="form-input" rows={3} value={form.agent_note} onChange={e => update('agent_note', e.target.value)} placeholder="Observations, contexte, points d'attention..." />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          {step > 1 ? (
            <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>Précédent</button>
          ) : <div />}
          {step < 4 ? (
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Suivant</button>
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
