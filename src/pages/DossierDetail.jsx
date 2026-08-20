import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, formatDate, formatDateTime, STATUS_LABELS, MONTHS, prequalLabel, prequalColor } from '../lib/format';
import { EVIDENCE_LEVELS } from '../lib/tokens';
import { isOnline, addToSyncQueue, saveEvidenceOffline } from '../lib/offline';
import { ArrowLeft, Plus, Play, AlertTriangle, CheckCircle, XCircle, WifiOff } from 'lucide-react';

const TABS = ['Résumé', 'Preuves', 'Cash-flow', 'Stress test', 'Préqualification', 'Décision', 'Audit'];

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
  const [tab, setTab] = useState('Résumé');
  const [loading, setLoading] = useState(true);
  const [bicData, setBicData] = useState(null);

  useEffect(() => { loadDossier(); }, [id]);

  async function loadDossier() {
    try {
      const res = await api.getDossier(id);
      setDossier(res.dossier);
      setEvidence(res.evidence || []);
      setCashflow(res.cashflow || []);
      setStressTests(res.stress_tests || []);
      setRuleEvals(res.rule_evaluations || []);
      setRiskFlags(res.risk_flags || []);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }

  async function loadAudit() {
    try { const res = await api.getDossierAudit(id); setAuditLogs(res.logs || []); } catch {}
  }

  async function checkBic() {
    if (!dossier?.applicant_id_number) return alert('N° d\'identité requis');
    try { const res = await api.checkBic(dossier.applicant_id_number); setBicData(res); } catch (err) { alert(err.message); }
  }

  async function runStressTest() {
    try { const res = await api.runStressTest(id); setStressTests(res.stress_tests || []); } catch (err) { alert(err.message); }
  }

  async function evaluateRules() {
    try { await api.evaluateRules(id); await loadDossier(); } catch (err) { alert(err.message); }
  }

  async function advanceStatus(newStatus) {
    try { await api.updateStatus(id, newStatus); await loadDossier(); } catch (err) { alert(err.message); }
  }

  useEffect(() => { if (tab === 'Audit') loadAudit(); }, [tab]);

  if (loading) return <div className="loading-state">Chargement du dossier...</div>;
  if (!dossier) return <div className="empty-state"><div className="empty-state-title">Dossier introuvable</div></div>;

  const workflowSteps = ['draft', 'submitted', 'verification', 'review', 'committee', 'decided'];
  const currentIdx = workflowSteps.indexOf(dossier.status);

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
          {dossier.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('submitted')}>Soumettre</button>}
          {dossier.status === 'submitted' && user?.role !== 'AGENT' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('verification')}>Vérifier</button>}
          {dossier.status === 'verification' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('review')}>Passer en revue</button>}
          {dossier.status === 'review' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('committee')}>Transmettre au comité</button>}
        </div>
      </div>

      <div className="workflow-bar">
        {workflowSteps.map((s, i) => (
          <span key={s} className={`workflow-step ${i === currentIdx ? 'current' : i < currentIdx ? 'done' : ''}`}>{STATUS_LABELS[s]}</span>
        ))}
      </div>

      <div className="tab-list">
        {TABS.map(t => <button key={t} className={`tab-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Résumé' && <SummaryTab dossier={dossier} evidence={evidence} cashflow={cashflow} bicData={bicData} onCheckBic={checkBic} />}
      {tab === 'Preuves' && <EvidenceTab dossierId={id} evidence={evidence} onReload={loadDossier} />}
      {tab === 'Cash-flow' && <CashflowTab dossierId={id} cashflow={cashflow} dossier={dossier} onReload={loadDossier} />}
      {tab === 'Stress test' && <StressTab stressTests={stressTests} onRun={runStressTest} />}
      {tab === 'Préqualification' && <PrequalTab dossier={dossier} ruleEvals={ruleEvals} onEvaluate={evaluateRules} />}
      {tab === 'Décision' && <DecisionTab dossier={dossier} onReload={loadDossier} />}
      {tab === 'Audit' && <AuditTab logs={auditLogs} />}
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

  async function handleAdd() {
    try {
      const data = { dossier_id: dossierId, ...form, amount: form.amount ? Number(form.amount) : null };
      if (isOnline()) { await api.addEvidence(data); }
      else { const id = crypto.randomUUID(); await saveEvidenceOffline({ id, ...data }); await addToSyncQueue({ operation: 'create', entity_type: 'evidence', entity_id: id, payload: data }); }
      setAdding(false);
      setForm({ category: 'VENTE', label: '', amount: '', source: '', source_detail: '', verification_level: 'D', evidence_date: '' });
      onReload();
    } catch (err) { alert(err.message); }
  }

  const levelColors = { A: { bg: '#d1fae5', text: '#065f46' }, B: { bg: '#dbeafe', text: '#1e40af' }, C: { bg: '#fef3c7', text: '#92400e' }, D: { bg: '#f3f4f6', text: '#374151' } };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Preuves au dossier ({evidence.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}><Plus size={14} /> Ajouter une preuve</button>
      </div>

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
                <option value="DOCUMENT">Document</option>
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
              <input className="input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
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
              <input className="input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Détail source</label>
              <input className="input" value={form.source_detail} onChange={e => setForm(f => ({ ...f, source_detail: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
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
  const [entries, setEntries] = useState(
    cashflow.length > 0 ? cashflow : Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year: 2026, revenue: 0, expenses: 0, debt_payments: 0 }))
  );

  async function handleSave() {
    try { await api.saveCashflow(dossierId, entries); setEditing(false); onReload(); } catch (err) { alert(err.message); }
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

      <div className="metrics-row">
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)', color: 'var(--c-success)' }}>{formatCFA(totalRevenue)}</div><div className="metric-label">Revenus annuels</div></div>
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)', color: 'var(--c-error)' }}>{formatCFA(totalExpenses + totalDebt)}</div><div className="metric-label">Charges + dettes</div></div>
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)' }}>{formatCFA(totalRevenue - totalExpenses - totalDebt)}</div><div className="metric-label">Flux net</div></div>
        <div className="metric-card"><div className="metric-value" style={{ fontSize: 'var(--fs-xl)' }}>{formatCFA(monthlyPayment)}</div><div className="metric-label">Échéance mensuelle</div></div>
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

function DecisionTab({ dossier, onReload }) {
  const user = getUser();
  const canDecide = ['COMITE', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'].includes(user?.role);
  const [form, setForm] = useState({ decision: 'approved', amount: dossier.amount_requested || '', duration: dossier.duration_months || '', schedule: '', motif: '' });
  const [confirming, setConfirming] = useState(false);

  async function handleDecide() {
    try { await api.decideDossier(dossier.id, form); onReload(); } catch (err) { alert(err.message); }
  }

  if (dossier.decision) {
    const isOverride = dossier.decision_amount && dossier.decision_amount !== dossier.amount_requested;
    return (
      <div className="surface">
        <div className="flex items-center gap-3 mb-4">
          {dossier.decision === 'approved' || dossier.decision === 'modified' ? <CheckCircle size={22} color="var(--c-success)" /> : <XCircle size={22} color="var(--c-error)" />}
          <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>
            {dossier.decision === 'approved' ? 'Approuvé' : dossier.decision === 'refused' ? 'Refusé' : dossier.decision === 'complement' ? 'Complément requis' : 'Approuvé avec modification'}
          </span>
          {isOverride && <span className="badge badge-warning">Override humain</span>}
        </div>
        {dossier.decision_amount && <p>Montant accordé: <strong>{formatCFA(dossier.decision_amount)}</strong> {isOverride && <span className="text-sm text-muted">(demandé: {formatCFA(dossier.amount_requested)})</span>}</p>}
        {dossier.decision_duration && <p>Durée: <strong>{dossier.decision_duration} mois</strong></p>}
        <p style={{ marginTop: 12 }}><strong>Motif:</strong> {dossier.decision_motif}</p>
        <p className="text-xs text-muted" style={{ marginTop: 8 }}>Décidé le {formatDateTime(dossier.decided_at)}</p>
      </div>
    );
  }

  if (!canDecide) return <div className="surface"><div className="empty-state"><div className="empty-state-title">En attente de décision</div><div className="empty-state-desc">Le comité de crédit examinera ce dossier.</div></div></div>;

  return (
    <div className="decision-panel">
      <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600, marginBottom: 20 }}>Décision du comité</h2>
      <div className="grid-2">
        <div className="field">
          <label className="field-label">Décision</label>
          <select className="input" value={form.decision} onChange={e => setForm(f => ({ ...f, decision: e.target.value }))}>
            <option value="approved">Approuver</option>
            <option value="modified">Approuver avec modification</option>
            <option value="complement">Demander complément</option>
            <option value="refused">Refuser</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Montant accordé (FCFA)</label>
          <input className="input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
        </div>
        <div className="field">
          <label className="field-label">Durée (mois)</label>
          <input className="input" type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
        </div>
        <div className="field">
          <label className="field-label">Calendrier</label>
          <input className="input" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Motif de la décision *</label>
          <textarea className="input" rows={3} value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} />
          <div className="field-hint">Le motif est obligatoire et sera enregistré dans le journal d'audit</div>
        </div>
      </div>

      {confirming && (
        <div className="decision-confirmation">
          {form.amount != dossier.amount_requested && (
            <p><strong>Vous accordez {formatCFA(form.amount)} au lieu des {formatCFA(dossier.amount_requested)} demandés.</strong></p>
          )}
          <p>Cette décision sera enregistrée{form.amount != dossier.amount_requested ? ' comme override humain' : ''}.</p>
        </div>
      )}

      <div className="flex gap-3 mt-4">
        {!confirming ? (
          <button className="btn btn-primary" onClick={() => { if (!form.motif) return alert('Le motif est obligatoire'); setConfirming(true); }}>Valider la décision</button>
        ) : (
          <>
            <button className="btn btn-primary" onClick={handleDecide}>Confirmer définitivement</button>
            <button className="btn btn-secondary" onClick={() => setConfirming(false)}>Annuler</button>
          </>
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
