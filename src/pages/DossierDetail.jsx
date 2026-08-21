import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, formatDate, formatDateTime, STATUS_LABELS, MONTHS, prequalLabel, prequalColor } from '../lib/format';
import { EVIDENCE_LEVELS } from '../lib/tokens';
import { isOnline, addToSyncQueue, saveEvidenceOffline } from '../lib/offline';
import { ArrowLeft, Plus, Play, AlertTriangle, CheckCircle, XCircle, WifiOff, Shield, MapPin, FileCheck, Printer } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function getTabsForRole(role) {
  if (role === 'COMITE') return ['Mémo décision', 'Décision'];
  if (role === 'AUDITEUR') return ['Résumé', 'Preuves', 'Cash-flow', 'Préqualification', 'Audit'];
  if (role === 'RISK_MANAGER') return ['Résumé', 'Preuves', 'Cash-flow', 'Stress test', 'Préqualification', 'Contrôles', 'Audit'];
  if (role === 'SUPERVISEUR') return ['Résumé', 'Preuves', 'Cash-flow', 'Stress test', 'Préqualification', 'Contrôles', 'Audit'];
  if (role === 'AGENT') return ['Résumé', 'Preuves', 'Cash-flow', 'Contrôles'];
  return ['Résumé', 'Preuves', 'Cash-flow', 'Stress test', 'Préqualification', 'Contrôles', 'Décision', 'Audit'];
}

export default function DossierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const [dossier, setDossier] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [cashflow, setCashflow] = useState([]);
  const [stressTests, setStressTests] = useState([]);
  const [ruleEvals, setRuleEvals] = useState([]);
  const [riskFlags, setRiskFlags] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [tab, setTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bicData, setBicData] = useState(null);

  useEffect(() => { loadDossier(); }, [id]);

  useEffect(() => {
    if (!tab && user?.role) {
      const tabs = getTabsForRole(user.role);
      setTab(tabs[0]);
    }
  }, [user?.role]);

  async function loadDossier() {
    try {
      const res = await api.getDossier(id);
      setDossier(res.dossier);
      setEvidence(res.evidence || []);
      setCashflow(res.cashflow || []);
      setStressTests(res.stress_tests || []);
      setRuleEvals(res.rule_evaluations || []);
      setRiskFlags(res.risk_flags || []);
    } catch (err) {}
    finally { setLoading(false); }
  }

  async function loadAudit() {
    try { const res = await api.getDossierAudit(id); setAuditLogs(res.logs || []); } catch {}
  }

  async function checkBic() {
    if (!dossier?.applicant_id_number) return;
    try { const res = await api.checkBic(dossier.applicant_id_number); setBicData(res); } catch {}
  }

  async function runStressTest() {
    try { const res = await api.runStressTest(id); setStressTests(res.stress_tests || []); } catch {}
  }

  async function evaluateRules() {
    try { await api.evaluateRules(id); await loadDossier(); } catch {}
  }

  async function advanceStatus(newStatus) {
    try { await api.updateStatus(id, newStatus); await loadDossier(); } catch {}
  }

  useEffect(() => { if (tab === 'Audit') loadAudit(); }, [tab]);

  if (loading) return <div className="loading-state">Chargement du dossier...</div>;
  if (!dossier) return <div className="empty-state"><div className="empty-state-title">Dossier introuvable</div></div>;

  const workflowSteps = ['draft', 'submitted', 'verification', 'review', 'committee', 'decided'];
  const currentIdx = workflowSteps.indexOf(dossier.status);
  const role = user?.role;

  const canAdvance = (targetStatus) => {
    if (targetStatus === 'submitted' && dossier.status === 'draft') return ['AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'].includes(role);
    if (['verification', 'review', 'committee'].includes(targetStatus)) return ['SUPERVISEUR', 'ADMIN', 'SUPERADMIN'].includes(role);
    return false;
  };

  const nextStatus = () => {
    const next = workflowSteps[currentIdx + 1];
    if (!next || next === 'decided') return null;
    return canAdvance(next) ? next : null;
  };

  const ns = nextStatus();
  const nextLabel = { submitted: 'Soumettre', verification: 'Lancer vérification', review: 'Passer en revue', committee: 'Transmettre au comité' };

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dossiers')} style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Dossiers
      </button>

      <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">{dossier.applicant_name || 'Dossier'}</h1>
          <p className="page-subtitle">{dossier.applicant_location} · {dossier.activity_type || dossier.sector} · {formatCFA(dossier.amount_requested)}</p>
        </div>
        <div className="flex gap-2">
          {ns && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus(ns)}>{nextLabel[ns]}</button>}
          {dossier.status === 'committee' && ['COMITE', 'ADMIN', 'SUPERADMIN'].includes(role) && !dossier.decision && <button className="btn btn-primary btn-sm" onClick={() => setTab('Décision')}>Prendre une décision</button>}
        </div>
      </div>

      <div className="workflow-bar">
        {workflowSteps.map((s, i) => (
          <span key={s} className={`workflow-step ${i === currentIdx ? 'current' : i < currentIdx ? 'done' : ''}`}>{STATUS_LABELS[s]}</span>
        ))}
      </div>

      <div className="tab-list">
        {getTabsForRole(role).map(t => <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Résumé' && <SummaryTab dossier={dossier} evidence={evidence} cashflow={cashflow} bicData={bicData} onCheckBic={checkBic} />}
      {tab === 'Mémo décision' && <MemoTab dossier={dossier} evidence={evidence} cashflow={cashflow} ruleEvals={ruleEvals} />}
      {tab === 'Preuves' && <EvidenceTab dossierId={id} evidence={evidence} onReload={loadDossier} />}
      {tab === 'Cash-flow' && <CashflowTab dossierId={id} cashflow={cashflow} dossier={dossier} onReload={loadDossier} />}
      {tab === 'Stress test' && <StressTab stressTests={stressTests} onRun={runStressTest} />}
      {tab === 'Préqualification' && <PrequalTab dossier={dossier} ruleEvals={ruleEvals} onEvaluate={evaluateRules} />}
      {tab === 'Contrôles' && <ControlsTab dossierId={id} dossier={dossier} />}
      {tab === 'Décision' && <DecisionTab dossier={dossier} onReload={loadDossier} />}
      {tab === 'Audit' && <AuditTab logs={auditLogs} />}
    </div>
  );
}

function ScoreCircle({ score }) {
  if (score == null) return null;
  const color = score > 70 ? '#059669' : score >= 40 ? '#d97706' : '#dc2626';
  const bg = score > 70 ? '#ecfdf5' : score >= 40 ? '#fffbeb' : '#fef2f2';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: bg, border: `3px solid ${color}`, flexShrink: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color }}>{score}</span>
    </div>
  );
}

function MemoTab({ dossier, evidence, cashflow, ruleEvals }) {
  const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalExpenses = cashflow.reduce((s, e) => s + (e.expenses || 0), 0);
  const totalDebt = cashflow.reduce((s, e) => s + (e.debt_payments || 0), 0);
  const fluxNet = totalRevenue - totalExpenses - totalDebt;
  const highEvidence = evidence.filter(e => ['A', 'B'].includes(e.verification_level));

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimer le mémo</button>
      </div>
      <div className="print-area" style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-md)', padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid var(--c-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            {dossier.prequalification_score != null && <ScoreCircle score={dossier.prequalification_score} />}
            <div>
              <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--c-primary)' }}>Mémo de crédit</h2>
              <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', marginTop: 4 }}>{dossier.applicant_name} — {formatCFA(dossier.amount_requested)}</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          <div>
            <MemoSection title="Demandeur">
              <p><strong>{dossier.applicant_name}</strong></p>
              <p>{dossier.applicant_location} · {dossier.applicant_phone}</p>
              <p>{dossier.sector} · {dossier.activity_type} · {dossier.years_experience} ans</p>
            </MemoSection>
          </div>
          <div>
            <MemoSection title="Demande">
              <p>Montant : <strong>{formatCFA(dossier.amount_requested)}</strong></p>
              <p>Durée : {dossier.duration_months} mois · {dossier.desired_schedule}</p>
              <p>Objet : {dossier.credit_purpose}</p>
            </MemoSection>
          </div>
        </div>

        <MemoSection title="Capacité financière">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 8 }}>
            <div style={{ textAlign: 'center', padding: 10, background: '#ecfdf5', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#059669' }}>{formatCFA(totalRevenue)}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Revenus annuels</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: '#fef2f2', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#dc2626' }}>{formatCFA(totalExpenses + totalDebt)}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Charges + dettes</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: fluxNet >= 0 ? '#ecfdf5' : '#fef2f2', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: fluxNet >= 0 ? '#059669' : '#dc2626' }}>{formatCFA(fluxNet)}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Flux net annuel</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: '#f3f4f6', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>{formatCFA(dossier.savings_amount || 0)}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Épargne</div>
            </div>
          </div>
        </MemoSection>

        <MemoSection title="Garanties">
          <p>{dossier.guarantee_type || 'Non renseigné'} {dossier.group_guarantee && `· ${dossier.group_guarantee}`}</p>
          {dossier.other_guarantees && <p style={{ marginTop: 4 }}>{dossier.other_guarantees}</p>}
        </MemoSection>

        <MemoSection title={`Preuves (${evidence.length} pièces dont ${highEvidence.length} vérifiées A/B)`}>
          {evidence.length > 0 ? (
            <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
              {evidence.slice(0, 6).map(e => (
                <div key={e.id} style={{ fontSize: 'var(--fs-12)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 3, background: e.verification_level === 'A' ? '#d1fae5' : e.verification_level === 'B' ? '#dbeafe' : '#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{e.verification_level}</span>
                  <span>{e.label}</span>
                  {e.amount && <span style={{ color: 'var(--c-500)' }}>{formatCFA(e.amount)}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-muted">Aucune preuve au dossier</p>}
        </MemoSection>

        {dossier.prequalification && (
          <MemoSection title="Préqualification">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ padding: '4px 10px', borderRadius: 'var(--radius)', fontWeight: 600, fontSize: 'var(--fs-12)', background: prequalColor(dossier.prequalification) === 'green' ? '#d1fae5' : prequalColor(dossier.prequalification) === 'amber' ? '#fef3c7' : '#fee2e2', color: prequalColor(dossier.prequalification) === 'green' ? '#065f46' : prequalColor(dossier.prequalification) === 'amber' ? '#92400e' : '#991b1b' }}>
                {prequalLabel(dossier.prequalification)}
              </span>
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)' }}>
                Confiance: {dossier.evidence_confidence || '—'} · Capacité: {dossier.repayment_capacity || '—'}
              </span>
            </div>
          </MemoSection>
        )}

        {dossier.agent_note && (
          <MemoSection title="Note de l'agent">
            <p style={{ fontStyle: 'italic' }}>{dossier.agent_note}</p>
          </MemoSection>
        )}

        {dossier.prequalification_score != null && (
          <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '2px solid var(--c-primary)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginBottom: 4 }}>SCORE DE CREDIT</div>
            <ScoreCircle score={dossier.prequalification_score} />
            <div style={{ fontSize: 'var(--fs-12)', color: '#6b7280', marginTop: 4 }}>/100</div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function SummaryTab({ dossier, evidence, cashflow, bicData, onCheckBic }) {
  const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalExpenses = cashflow.reduce((s, e) => s + (e.expenses || 0), 0);
  const totalDebt = cashflow.reduce((s, e) => s + (e.debt_payments || 0), 0);

  return (
    <div className="grid-2">
      <div className="surface">
        <Section title="Identité">
          <p><strong>{dossier.applicant_name}</strong></p>
          <p className="text-sm text-muted">{dossier.applicant_phone} · {dossier.applicant_id_number}</p>
          <p className="text-sm">{dossier.applicant_location}</p>
        </Section>
        <Section title="Activité">
          <p>{dossier.sector} · {dossier.activity_type}</p>
          <p className="text-sm text-muted">{dossier.years_experience} ans · {dossier.surface_ha} ha · Cycle: {dossier.production_cycle}</p>
        </Section>
        <Section title="Demande de crédit">
          <p style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>{formatCFA(dossier.amount_requested)}</p>
          <p className="text-sm">{dossier.credit_purpose}</p>
          <p className="text-sm text-muted">{dossier.duration_months} mois · {dossier.desired_schedule}</p>
        </Section>
        <Section title="Garanties">
          <p className="text-sm">Épargne: {formatCFA(dossier.savings_amount)} · {dossier.guarantee_type}</p>
          {dossier.group_guarantee && <p className="text-sm text-muted">{dossier.group_guarantee}</p>}
        </Section>
        {dossier.agent_note && (
          <Section title="Note de l'agent">
            <p className="text-sm">{dossier.agent_note}</p>
          </Section>
        )}
      </div>

      <div>
        {dossier.prequalification && (
          <div className={`prequal-panel ${prequalColor(dossier.prequalification) === 'green' ? 'success' : prequalColor(dossier.prequalification) === 'amber' ? 'warning' : 'error'}`}>
            <div className="prequal-title">{prequalLabel(dossier.prequalification)}</div>
            <div className="prequal-dimensions">
              <div><div className="prequal-dim-label">Confiance preuves</div><div className="prequal-dim-value">{dossier.evidence_confidence || '—'}</div></div>
              <div><div className="prequal-dim-label">Capacité remboursement</div><div className="prequal-dim-value">{dossier.repayment_capacity || '—'}</div></div>
              <div><div className="prequal-dim-label">Preuves au dossier</div><div className="prequal-dim-value">{evidence.length}</div></div>
            </div>
          </div>
        )}

        <div className="surface mb-4">
          <Section title="Cash-flow annuel">
            <div className="grid-3" style={{ gap: 12 }}>
              <div><div className="text-xs text-muted">Revenus</div><div className="font-bold text-success">{formatCFA(totalRevenue)}</div></div>
              <div><div className="text-xs text-muted">Charges + dettes</div><div className="font-bold text-error">{formatCFA(totalExpenses + totalDebt)}</div></div>
              <div><div className="text-xs text-muted">Flux net</div><div className="font-bold">{formatCFA(totalRevenue - totalExpenses - totalDebt)}</div></div>
            </div>
          </Section>
        </div>

        {dossier.decision && (
          <div className="surface mb-4" style={{ borderLeft: `4px solid ${dossier.decision === 'approved' || dossier.decision === 'modified' ? '#059669' : dossier.decision === 'refused' ? '#dc2626' : '#d97706'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {dossier.decision === 'approved' || dossier.decision === 'modified' ? <CheckCircle size={18} color="#059669" /> : dossier.decision === 'refused' ? <XCircle size={18} color="#dc2626" /> : <AlertTriangle size={18} color="#d97706" />}
              <strong style={{ fontSize: 'var(--fs-md)' }}>
                {dossier.decision === 'approved' ? 'Approuvé' : dossier.decision === 'refused' ? 'Refusé' : dossier.decision === 'complement' ? 'Complément requis' : 'Approuvé avec modification'}
              </strong>
            </div>
            {dossier.decision_amount && <p style={{ fontSize: 'var(--fs-12)' }}>Montant accordé : <strong>{formatCFA(dossier.decision_amount)}</strong></p>}
            {dossier.decision_motif && <p style={{ fontSize: 'var(--fs-12)', marginTop: 4, color: 'var(--c-600)' }}>{dossier.decision_motif}</p>}
          </div>
        )}

        <div className="surface mb-4">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>BIC — Données simulées</div>
            <button className="btn btn-secondary btn-sm" onClick={onCheckBic}>Consulter</button>
          </div>
          {bicData && (
            <div style={{ marginTop: 12 }}>
              {bicData.summary.total_records === 0 ? (
                <p className="text-sm text-success">Aucun crédit existant trouvé</p>
              ) : (
                <div>
                  <p className="text-sm"><strong>{bicData.summary.total_records}</strong> crédit(s) · Encours: <strong>{formatCFA(bicData.summary.total_outstanding)}</strong></p>
                  {bicData.summary.has_late_payments && <p className="text-sm text-error">Retard de paiement détecté ({bicData.summary.max_days_late} jours)</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--c-100)' }}>
      <div className="text-xs font-semibold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function EvidenceTab({ dossierId, evidence, onReload }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ category: 'VENTE', label: '', amount: '', source: '', source_detail: '', verification_level: 'D', evidence_date: '' });
  const [error, setError] = useState('');

  async function handleAdd() {
    setError('');
    try {
      const data = { dossier_id: dossierId, ...form, amount: form.amount ? Number(form.amount) : null };
      if (isOnline()) { await api.addEvidence(data); }
      else { const id = crypto.randomUUID(); await saveEvidenceOffline({ id, ...data }); await addToSyncQueue({ operation: 'create', entity_type: 'evidence', entity_id: id, payload: data }); }
      setAdding(false);
      setForm({ category: 'VENTE', label: '', amount: '', source: '', source_detail: '', verification_level: 'D', evidence_date: '' });
      onReload();
    } catch (err) { setError(err.message); }
  }

  const levelColors = { A: { bg: '#d1fae5', text: '#065f46' }, B: { bg: '#dbeafe', text: '#1e40af' }, C: { bg: '#fef3c7', text: '#92400e' }, D: { bg: '#f3f4f6', text: '#374151' } };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Preuves au dossier ({evidence.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}><Plus size={14} /> Ajouter une preuve</button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}

      {adding && (
        <div className="surface mb-4">
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Catégorie</label>
              <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="VENTE">Vente</option>
                <option value="LIVRAISON">Livraison</option>
                <option value="HISTORIQUE_IMF">Historique IMF</option>
                <option value="EPARGNE">Épargne</option>
                <option value="VISITE_TERRAIN">Visite terrain</option>
                <option value="DOCUMENT">Document (CNI, carte membre, etc.)</option>
                <option value="PHOTO">Photo terrain / activité</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Niveau de vérification</label>
              <select className="input" value={form.verification_level} onChange={e => setForm(f => ({ ...f, verification_level: e.target.value }))}>
                {Object.entries(EVIDENCE_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">Libellé *</label>
              <input className="input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Photo CNI recto, Attestation coopérative Kaffrine..." />
            </div>
            <div className="field">
              <label className="field-label">Montant (FCFA)</label>
              <input className="input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Date</label>
              <input className="input" type="date" value={form.evidence_date} onChange={e => setForm(f => ({ ...f, evidence_date: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Source *</label>
              <input className="input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Agent, coopérative, système..." />
            </div>
            <div className="field">
              <label className="field-label">Détail source</label>
              <input className="input" value={form.source_detail} onChange={e => setForm(f => ({ ...f, source_detail: e.target.value }))} placeholder="Référence, n° de document..." />
            </div>
          </div>
          <div style={{ padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius)', marginTop: 12, marginBottom: 12, fontSize: 'var(--fs-11)', color: '#92400e' }}>
            <strong>Fichiers :</strong> Les pièces jointes (photos, PDF) sont enregistrées comme référence textuelle. Dans un déploiement réel, un module d'upload sera connecté.
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!form.label || !form.source}>Enregistrer</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </div>
      )}

      {evidence.length === 0 ? (
        <div className="surface"><div className="empty-state"><div className="empty-state-title">Aucune preuve au dossier</div><div className="empty-state-desc">Ajoutez des preuves pour renforcer le dossier de crédit.</div></div></div>
      ) : (
        evidence.map(e => (
          <div key={e.id} className="evidence-card">
            <div className="evidence-level-badge" style={{ background: levelColors[e.verification_level]?.bg, color: levelColors[e.verification_level]?.text }}>
              {e.verification_level}
            </div>
            <div className="evidence-body">
              <div className="evidence-title">{e.label}</div>
              <div className="evidence-meta">
                {e.category} · {e.source} · {formatDate(e.evidence_date)}
                {e.amount && <span className="evidence-amount" style={{ marginLeft: 8 }}>{formatCFA(e.amount)}</span>}
              </div>
              <div className="evidence-meta" style={{ marginTop: 4 }}>{EVIDENCE_LEVELS[e.verification_level]}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CashflowTab({ dossierId, cashflow, dossier, onReload }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState(
    cashflow.length > 0 ? cashflow : Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year: 2026, revenue: 0, expenses: 0, debt_payments: 0 }))
  );

  async function handleSave() {
    setError('');
    try { await api.saveCashflow(dossierId, entries); setEditing(false); onReload(); } catch (err) { setError(err.message); }
  }

  const totalRevenue = entries.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalExpenses = entries.reduce((s, e) => s + (e.expenses || 0), 0);
  const totalDebt = entries.reduce((s, e) => s + (e.debt_payments || 0), 0);
  const monthlyPayment = dossier.amount_requested && dossier.duration_months ? Math.ceil(dossier.amount_requested / dossier.duration_months) : 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Cash-flow saisonnier</h2>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(!editing)}>{editing ? 'Annuler' : 'Modifier'}</button>
      </div>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}

      <div className="metrics-row">
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)', color: 'var(--c-success)' }}>{formatCFA(totalRevenue)}</div><div className="metric-label">Revenus annuels</div></div>
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)', color: 'var(--c-error)' }}>{formatCFA(totalExpenses + totalDebt)}</div><div className="metric-label">Charges + dettes</div></div>
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)' }}>{formatCFA(totalRevenue - totalExpenses - totalDebt)}</div><div className="metric-label">Flux net</div></div>
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)' }}>{formatCFA(monthlyPayment)}</div><div className="metric-label">Échéance mensuelle</div></div>
      </div>

      <div className="surface mb-4">
        <div className="surface-title">Évolution mensuelle</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={entries.map((e, i) => ({ name: MONTHS[i]?.slice(0, 3), revenus: e.revenue || 0, charges: (e.expenses || 0) + (e.debt_payments || 0), net: (e.revenue || 0) - (e.expenses || 0) - (e.debt_payments || 0) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip formatter={v => new Intl.NumberFormat('fr-FR').format(v) + ' FCFA'} />
            <Line type="monotone" dataKey="revenus" stroke="#059669" strokeWidth={2} dot={false} name="Revenus" />
            <Line type="monotone" dataKey="charges" stroke="#dc2626" strokeWidth={2} dot={false} name="Charges" />
            <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Flux net" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="surface" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="cashflow-table">
            <thead><tr><th style={{ textAlign: 'left' }}>Mois</th><th>Revenus</th><th>Charges</th><th>Dettes</th><th>Flux net</th></tr></thead>
            <tbody>
              {entries.map((e, i) => {
                const net = (e.revenue || 0) - (e.expenses || 0) - (e.debt_payments || 0);
                const isPressure = net < 0;
                return (
                  <tr key={i} className={isPressure ? 'cashflow-pressure' : ''}>
                    <td style={{ fontWeight: 500 }}>{MONTHS[i]}</td>
                    {editing ? (
                      <>
                        <td><input type="number" className="input" style={{ width: 100, textAlign: 'right', padding: '4px 8px' }} value={e.revenue} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], revenue: Number(ev.target.value) }; setEntries(n); }} /></td>
                        <td><input type="number" className="input" style={{ width: 100, textAlign: 'right', padding: '4px 8px' }} value={e.expenses} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], expenses: Number(ev.target.value) }; setEntries(n); }} /></td>
                        <td><input type="number" className="input" style={{ width: 100, textAlign: 'right', padding: '4px 8px' }} value={e.debt_payments} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], debt_payments: Number(ev.target.value) }; setEntries(n); }} /></td>
                      </>
                    ) : (
                      <>
                        <td>{formatCFA(e.revenue)}</td>
                        <td>{formatCFA(e.expenses)}</td>
                        <td>{formatCFA(e.debt_payments)}</td>
                      </>
                    )}
                    <td className={net >= 0 ? 'cashflow-positive' : 'cashflow-negative'} style={{ fontWeight: 600 }}>{formatCFA(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editing && (
          <div style={{ padding: 16, borderTop: '1px solid var(--c-200)' }}>
            <button className="btn btn-primary" onClick={handleSave}>Enregistrer le cash-flow</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StressTab({ stressTests, onRun }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Scénarios de stress</h2>
        <button className="btn btn-primary btn-sm" onClick={onRun}><Play size={14} /> Lancer les scénarios</button>
      </div>

      {stressTests.length === 0 ? (
        <div className="surface"><div className="empty-state"><div className="empty-state-title">Aucun stress test effectué</div><div className="empty-state-desc">Exécutez les scénarios pour évaluer la résilience du cash-flow.</div></div></div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {stressTests.map(s => (
            <div key={s.id || s.scenario} className={`flag-item ${s.can_repay ? '' : 'critical'}`} style={{ borderLeftWidth: 4 }}>
              <div style={{ flex: 1 }}>
                <div className="flag-title">{s.description}</div>
                <div className="flag-desc">Revenus ajustés: {Math.round(s.revenue_adjustment * 100)}% · Capacité mensuelle: {formatCFA(s.monthly_capacity)} · Marge: {s.margin_percent}%</div>
                <div className="text-sm" style={{ marginTop: 6, fontStyle: 'italic', color: s.can_repay ? 'var(--c-success)' : 'var(--c-error)' }}>{s.recommendation}</div>
              </div>
              <span className={`badge ${s.can_repay ? 'badge-success' : 'badge-error'}`}>{s.can_repay ? 'OK' : 'Insuffisant'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrequalTab({ dossier, ruleEvals, onEvaluate }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Préqualification</h2>
        <button className="btn btn-primary btn-sm" onClick={onEvaluate}><Play size={14} /> Évaluer les règles</button>
      </div>

      {dossier.prequalification_score != null && (
        <div className="surface mb-4" style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20 }}>
          <ScoreCircle score={dossier.prequalification_score} />
          <div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>Score de crédit : {dossier.prequalification_score}/100</div>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', marginTop: 2 }}>
              {dossier.prequalification_score > 70 ? 'Dossier solide — recommandation favorable' : dossier.prequalification_score >= 40 ? 'Dossier à examiner — points d\'attention détectés' : 'Dossier fragile — risque élevé identifié'}
            </div>
          </div>
        </div>
      )}

      {dossier.prequalification && (
        <div className={`prequal-panel ${prequalColor(dossier.prequalification) === 'green' ? 'success' : prequalColor(dossier.prequalification) === 'amber' ? 'warning' : 'error'}`}>
          <div className="prequal-title">{prequalLabel(dossier.prequalification)}</div>
          <div className="prequal-dimensions">
            <div><div className="prequal-dim-label">Confiance dans les preuves</div><div className="prequal-dim-value">{dossier.evidence_confidence || '—'}</div></div>
            <div><div className="prequal-dim-label">Capacité de remboursement</div><div className="prequal-dim-value">{dossier.repayment_capacity || '—'}</div></div>
            <div><div className="prequal-dim-label">Règles déclenchées</div><div className="prequal-dim-value">{ruleEvals.filter(e => e.triggered).length}</div></div>
          </div>
          {dossier.prequalification_reasons && (
            <ul className="prequal-reasons">
              {JSON.parse(dossier.prequalification_reasons || '[]').map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      {ruleEvals.length > 0 && (
        <div className="surface">
          <div className="surface-title">Évaluation des règles</div>
          {ruleEvals.map(e => (
            <div key={e.id} className={`flag-item ${e.triggered ? (e.result === 'NON_ELIGIBLE' ? 'critical' : 'high') : ''}`} style={{ borderLeftWidth: e.triggered ? 3 : 0 }}>
              {e.triggered ? (e.result === 'NON_ELIGIBLE' ? <XCircle size={16} color="var(--c-error)" /> : <AlertTriangle size={16} color="var(--c-warning)" />) : <CheckCircle size={16} color="var(--c-success)" />}
              <div style={{ flex: 1 }}>
                <div className="flag-title">{e.rule_code || e.code} — {e.rule_name || e.name}</div>
                {e.triggered && <div className="flag-desc">{e.explanation}</div>}
              </div>
              {e.triggered && <span className={`badge ${e.result === 'NON_ELIGIBLE' ? 'badge-error' : 'badge-warning'}`}>{e.result === 'NON_ELIGIBLE' ? 'Non éligible' : 'Revue requise'}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ControlsTab({ dossierId, dossier }) {
  const [fraudChecks, setFraudChecks] = useState([]);
  const [visits, setVisits] = useState([]);
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addingVisit, setAddingVisit] = useState(false);
  const [visitForm, setVisitForm] = useState({ observations: '', activity_confirmed: true, surface_observed: '', gps_lat: '', gps_lon: '', documents_collected: [] });
  const [addingConsent, setAddingConsent] = useState(false);
  const [consentForm, setConsentForm] = useState({ consent_type: 'data_collection', consent_given: true, consent_method: 'verbal' });

  useEffect(() => { loadControls(); }, []);

  async function loadControls() {
    try {
      const [f, v, c] = await Promise.all([
        api.getFraudChecks(dossierId),
        api.getVisits(dossierId),
        api.getConsents(dossierId),
      ]);
      setFraudChecks(f.checks || []);
      setVisits(v.visits || []);
      setConsents(c.consents || []);
    } catch {}
  }

  async function runFraud() {
    setLoading(true); setError('');
    try {
      const res = await api.runFraudCheck(dossierId);
      setFraudChecks(res.checks || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function saveVisit() {
    setError('');
    try {
      const payload = {
        dossier_id: dossierId,
        observations: visitForm.observations,
        activity_confirmed: visitForm.activity_confirmed,
        surface_observed: visitForm.surface_observed ? Number(visitForm.surface_observed) : null,
        gps_lat: visitForm.gps_lat ? Number(visitForm.gps_lat) : null,
        gps_lon: visitForm.gps_lon ? Number(visitForm.gps_lon) : null,
      };
      if (visitForm.documents_collected.length > 0) {
        payload.observations = `${payload.observations}\n\nDocuments collectés : ${visitForm.documents_collected.join(', ')}`;
      }
      await api.createVisit(payload);
      setAddingVisit(false);
      setVisitForm({ observations: '', activity_confirmed: true, surface_observed: '', gps_lat: '', gps_lon: '', documents_collected: [] });
      loadControls();
    } catch (err) { setError(err.message); }
  }

  async function getGPS() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setVisitForm(f => ({ ...f, gps_lat: pos.coords.latitude.toFixed(6), gps_lon: pos.coords.longitude.toFixed(6) })),
        () => setError('Impossible d\'obtenir la localisation GPS')
      );
    }
  }

  function toggleDoc(doc) {
    setVisitForm(f => ({
      ...f,
      documents_collected: f.documents_collected.includes(doc)
        ? f.documents_collected.filter(d => d !== doc)
        : [...f.documents_collected, doc]
    }));
  }

  async function saveConsent() {
    setError('');
    try {
      await api.createConsent({ dossier_id: dossierId, applicant_name: dossier.applicant_name, ...consentForm });
      setAddingConsent(false);
      loadControls();
    } catch (err) { setError(err.message); }
  }

  const severityLabel = { clean: 'badge-success', warning: 'badge-warning', critical: 'badge-error' };
  const DOCS_CHECKLIST = ['Photo terrain', 'Photo CNI', 'Carte membre coopérative', 'Fiche RIT', 'Reçus de vente', 'Attestation coopérative', 'Relevé mobile money'];

  return (
    <div>
      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}

      <div className="surface mb-4">
        <div className="surface-header">
          <div className="surface-title" style={{ margin: 0 }}>Contrôles de cohérence</div>
          <button className="btn btn-primary btn-sm" onClick={runFraud} disabled={loading}>
            <Shield size={13} /> {loading ? 'Vérification...' : 'Lancer les contrôles'}
          </button>
        </div>
        {fraudChecks.length === 0 ? (
          <p className="text-sm text-muted">Aucun contrôle effectué. Cliquez sur « Lancer les contrôles » pour vérifier la cohérence du dossier.</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {fraudChecks.map((c, i) => (
              <div key={i} className={`flag-item ${c.result === 'critical' ? 'critical' : c.result === 'warning' ? 'high' : 'medium'}`}>
                <div style={{ flex: 1 }}>
                  <div className="flag-title">{c.check_type.replace(/_/g, ' ')}</div>
                  <div className="flag-desc">{c.details}</div>
                </div>
                <span className={`badge ${severityLabel[c.result] || 'badge-neutral'}`}>{c.result === 'clean' ? 'OK' : c.result}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface mb-4">
        <div className="surface-header">
          <div className="surface-title" style={{ margin: 0 }}>Visites terrain ({visits.length})</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddingVisit(!addingVisit)}><MapPin size={13} /> Ajouter visite</button>
        </div>
        {addingVisit && (
          <div style={{ marginBottom: 12, padding: 14, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-border)' }}>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Surface observée (ha)</label>
                <input className="input" type="number" step="0.1" value={visitForm.surface_observed} onChange={e => setVisitForm(f => ({ ...f, surface_observed: e.target.value }))} placeholder="Ex: 7" />
              </div>
              <div className="field">
                <label className="field-label">Coordonnées GPS</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" placeholder="Latitude" value={visitForm.gps_lat} onChange={e => setVisitForm(f => ({ ...f, gps_lat: e.target.value }))} style={{ flex: 1 }} />
                  <input className="input" placeholder="Longitude" value={visitForm.gps_lon} onChange={e => setVisitForm(f => ({ ...f, gps_lon: e.target.value }))} style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" onClick={getGPS} type="button" title="Obtenir position actuelle"><MapPin size={13} /></button>
                </div>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Observations terrain</label>
              <textarea className="input" rows={3} value={visitForm.observations} onChange={e => setVisitForm(f => ({ ...f, observations: e.target.value }))} placeholder="État de la parcelle, cultures observées, équipements, bâtiments, voisinage..." />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">Activité confirmée ?</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" className={`btn btn-sm ${visitForm.activity_confirmed ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVisitForm(f => ({ ...f, activity_confirmed: true }))}>
                  <CheckCircle size={13} /> Oui, confirmée
                </button>
                <button type="button" className={`btn btn-sm ${!visitForm.activity_confirmed ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setVisitForm(f => ({ ...f, activity_confirmed: false }))}>
                  <XCircle size={13} /> Non confirmée
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">Documents collectés sur le terrain</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {DOCS_CHECKLIST.map(doc => (
                  <button key={doc} type="button" onClick={() => toggleDoc(doc)} style={{ padding: '5px 10px', fontSize: 'var(--fs-11)', borderRadius: 'var(--radius)', border: `1px solid ${visitForm.documents_collected.includes(doc) ? '#059669' : 'var(--c-border)'}`, background: visitForm.documents_collected.includes(doc) ? '#ecfdf5' : '#fff', color: visitForm.documents_collected.includes(doc) ? '#065f46' : 'var(--c-text)', cursor: 'pointer', fontWeight: visitForm.documents_collected.includes(doc) ? 600 : 400 }}>
                    {visitForm.documents_collected.includes(doc) && <span style={{ marginRight: 4 }}>✓</span>}{doc}
                  </button>
                ))}
              </div>
              <div className="field-hint" style={{ marginTop: 6 }}>Cochez les documents collectés. Les fichiers (photos, PDF) seront ajoutés via l'onglet Preuves.</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={saveVisit}>Enregistrer la visite</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddingVisit(false)}>Annuler</button>
            </div>
          </div>
        )}
        {visits.length === 0 && !addingVisit ? (
          <p className="text-sm text-muted">Aucune visite terrain enregistrée.</p>
        ) : (
          visits.map((v, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)' }}>
              <div className="flex justify-between items-center">
                <span className="font-semibold">{formatDate(v.visit_date || v.created_at)}</span>
                <span className={`badge ${v.activity_confirmed ? 'badge-success' : 'badge-warning'}`}>{v.activity_confirmed ? 'Activité confirmée' : 'Non confirmée'}</span>
              </div>
              {v.surface_observed && <p style={{ marginTop: 2, color: 'var(--c-600)' }}>Surface observée : {v.surface_observed} ha</p>}
              {v.observations && <p className="text-muted" style={{ marginTop: 2 }}>{v.observations}</p>}
              {v.gps_lat && v.gps_lon && <p style={{ marginTop: 2, fontSize: 'var(--fs-11)', color: 'var(--c-500)' }}>GPS: {v.gps_lat}, {v.gps_lon}</p>}
            </div>
          ))
        )}
      </div>

      <div className="surface">
        <div className="surface-header">
          <div className="surface-title" style={{ margin: 0 }}>Consentements ({consents.length})</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddingConsent(!addingConsent)}><FileCheck size={13} /> Enregistrer</button>
        </div>
        {addingConsent && (
          <div style={{ marginBottom: 12, padding: 12, background: 'var(--c-bg)', borderRadius: 'var(--radius-md)' }}>
            <div className="grid-2">
              <div className="field">
                <label className="field-label">Type de consentement</label>
                <select className="input" value={consentForm.consent_type} onChange={e => setConsentForm(f => ({ ...f, consent_type: e.target.value }))}>
                  <option value="data_collection">Collecte de données</option>
                  <option value="bic_check">Consultation BIC</option>
                  <option value="credit_check">Analyse de crédit</option>
                  <option value="data_sharing">Partage de données</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Méthode</label>
                <select className="input" value={consentForm.consent_method} onChange={e => setConsentForm(f => ({ ...f, consent_method: e.target.value }))}>
                  <option value="verbal">Verbal</option>
                  <option value="written">Écrit</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary btn-sm" onClick={saveConsent}>Enregistrer</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAddingConsent(false)}>Annuler</button>
            </div>
          </div>
        )}
        {consents.length === 0 && !addingConsent ? (
          <p className="text-sm text-muted">Aucun consentement enregistré.</p>
        ) : (
          consents.map((c, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--c-border-light)', fontSize: 'var(--fs-12)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.consent_type?.replace(/_/g, ' ')} — {c.consent_method}</span>
              <span className={`badge ${c.consent_given ? 'badge-success' : 'badge-error'}`}>{c.consent_given ? 'Accordé' : 'Refusé'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DecisionTab({ dossier, onReload }) {
  const user = getUser();
  const canDecide = ['COMITE', 'ADMIN', 'SUPERADMIN'].includes(user?.role);
  const [form, setForm] = useState({ decision: 'approved', amount: dossier.amount_requested || '', duration: dossier.duration_months || '', schedule: dossier.desired_schedule || '', motif: '' });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  async function handleDecide() {
    setError('');
    try { await api.decideDossier(dossier.id, form); setConfirming(false); onReload(); } catch (err) { setError(err.message); }
  }

  if (dossier.decision) {
    const isOverride = dossier.decision_amount && dossier.decision_amount !== dossier.amount_requested;
    return (
      <div className="surface" style={{ maxWidth: 600 }}>
        <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: 20, borderBottom: '2px solid var(--c-border)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dossier.decision === 'approved' || dossier.decision === 'modified' ? '#ecfdf5' : dossier.decision === 'refused' ? '#fef2f2' : '#fffbeb' }}>
            {dossier.decision === 'approved' || dossier.decision === 'modified' ? <CheckCircle size={24} color="#059669" /> : dossier.decision === 'refused' ? <XCircle size={24} color="#dc2626" /> : <AlertTriangle size={24} color="#d97706" />}
          </div>
          <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: dossier.decision === 'approved' || dossier.decision === 'modified' ? '#059669' : dossier.decision === 'refused' ? '#dc2626' : '#d97706' }}>
            {dossier.decision === 'approved' ? 'Crédit Approuvé' : dossier.decision === 'refused' ? 'Crédit Refusé' : dossier.decision === 'complement' ? 'Complément Requis' : 'Approuvé avec Modification'}
          </h3>
          {isOverride && <span className="badge badge-warning" style={{ marginTop: 8 }}>Override humain</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {dossier.decision_amount && (
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginBottom: 2 }}>Montant accordé</div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>{formatCFA(dossier.decision_amount)}</div>
              {isOverride && <div style={{ fontSize: 'var(--fs-xs)', color: '#9ca3af', marginTop: 2 }}>Demandé: {formatCFA(dossier.amount_requested)}</div>}
            </div>
          )}
          {dossier.decision_duration && (
            <div style={{ padding: 12, background: '#f9fafb', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginBottom: 2 }}>Durée accordée</div>
              <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>{dossier.decision_duration} mois</div>
            </div>
          )}
        </div>

        <div style={{ padding: 14, background: '#f9fafb', borderRadius: 'var(--radius)', marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>Motif de la décision</div>
          <p style={{ fontSize: 'var(--fs-12)', lineHeight: 1.6 }}>{dossier.decision_motif}</p>
        </div>

        <p style={{ fontSize: 'var(--fs-xs)', color: '#9ca3af', textAlign: 'center' }}>Décidé le {formatDateTime(dossier.decided_at)}</p>
      </div>
    );
  }

  if (!canDecide) return (
    <div className="surface" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 8 }}>En attente de décision du comité</div>
      <p style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)' }}>Seul le comité de crédit peut prendre cette décision.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="surface">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 20 }}>Décision du comité de crédit</h2>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid #fca5a5' }}>{error}</div>}

        <div className="field" style={{ marginBottom: 16 }}>
          <label className="field-label">Décision</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { v: 'approved', l: 'Approuver', c: '#059669', bg: '#ecfdf5' },
              { v: 'modified', l: 'Modifier', c: '#d97706', bg: '#fffbeb' },
              { v: 'complement', l: 'Complément', c: '#2563eb', bg: '#eff6ff' },
              { v: 'refused', l: 'Refuser', c: '#dc2626', bg: '#fef2f2' },
            ].map(opt => (
              <button key={opt.v} type="button" onClick={() => setForm(f => ({ ...f, decision: opt.v }))} style={{ padding: '10px 8px', borderRadius: 'var(--radius)', border: `2px solid ${form.decision === opt.v ? opt.c : 'var(--c-border)'}`, background: form.decision === opt.v ? opt.bg : '#fff', fontSize: 'var(--fs-12)', fontWeight: form.decision === opt.v ? 600 : 400, cursor: 'pointer', textAlign: 'center', color: form.decision === opt.v ? opt.c : 'var(--c-text)' }}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Montant accordé (FCFA)</label>
            <input className="input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            {form.amount != dossier.amount_requested && <div className="field-hint" style={{ color: '#d97706' }}>Différent du montant demandé ({formatCFA(dossier.amount_requested)})</div>}
          </div>
          <div className="field">
            <label className="field-label">Durée (mois)</label>
            <input className="input" type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Calendrier de remboursement</label>
          <select className="input" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}>
            <option value="">Sélectionner</option>
            <option value="Mensuel classique">Mensuel classique</option>
            <option value="Saisonnier (post-récolte)">Saisonnier (post-récolte)</option>
            <option value="Trimestriel">Trimestriel</option>
            <option value="In fine">In fine</option>
          </select>
        </div>

        <div className="field">
          <label className="field-label">Motif de la décision *</label>
          <textarea className="input" rows={4} value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} placeholder="Justification de la décision (obligatoire pour la traçabilité)" />
        </div>

        {!confirming ? (
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={() => { if (!form.motif) { setError('Le motif est obligatoire'); return; } setConfirming(true); }}>
            Valider la décision
          </button>
        ) : (
          <div style={{ marginTop: 16, padding: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)' }}>
            <p style={{ fontSize: 'var(--fs-12)', fontWeight: 600, marginBottom: 8 }}>Confirmer cette décision ?</p>
            {form.amount != dossier.amount_requested && (
              <p style={{ fontSize: 'var(--fs-12)', color: '#92400e', marginBottom: 8 }}>
                Montant modifié : {formatCFA(form.amount)} au lieu de {formatCFA(dossier.amount_requested)} (sera enregistré comme override).
              </p>
            )}
            <p style={{ fontSize: 'var(--fs-11)', color: '#6b7280', marginBottom: 12 }}>Cette action est définitive et sera enregistrée dans le journal d'audit.</p>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={handleDecide}>Confirmer définitivement</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditTab({ logs }) {
  if (logs.length === 0) return <div className="surface"><div className="empty-state"><div className="empty-state-title">Aucune entrée d'audit</div></div></div>;

  return (
    <div className="surface">
      <div className="audit-timeline">
        {logs.map(l => (
          <div key={l.id} className="audit-event">
            <div className="audit-time">{formatDateTime(l.created_at)}</div>
            <div className="audit-actor">{l.user_name} <span className="badge badge-neutral" style={{ marginLeft: 4 }}>{l.user_role}</span></div>
            <div className="audit-action">{l.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
