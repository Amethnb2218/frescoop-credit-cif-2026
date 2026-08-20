import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, formatDate, formatDateTime, STATUS_LABELS, VERIFICATION_LEVELS, MONTHS, prequalLabel, prequalColor } from '../lib/format';
import { isOnline, addToSyncQueue, saveEvidenceOffline } from '../lib/offline';
import { ArrowLeft, Plus, Play, FileText, AlertTriangle, CheckCircle, XCircle, WifiOff, Download } from 'lucide-react';

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
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    try {
      const res = await api.getDossierAudit(id);
      setAuditLogs(res.logs || []);
    } catch {}
  }

  async function checkBic() {
    if (!dossier?.applicant_id_number) return alert('N° d\'identité requis');
    try {
      const res = await api.checkBic(dossier.applicant_id_number);
      setBicData(res);
    } catch (err) { alert(err.message); }
  }

  async function runStressTest() {
    try {
      const res = await api.runStressTest(id);
      setStressTests(res.stress_tests || []);
    } catch (err) { alert(err.message); }
  }

  async function evaluateRules() {
    try {
      const res = await api.evaluateRules(id);
      setRuleEvals(res.evaluations || []);
      await loadDossier();
    } catch (err) { alert(err.message); }
  }

  async function advanceStatus(newStatus) {
    try {
      await api.updateStatus(id, newStatus);
      await loadDossier();
    } catch (err) { alert(err.message); }
  }

  useEffect(() => { if (tab === 'Audit') loadAudit(); }, [tab]);

  if (loading) return <p style={{ textAlign: 'center', padding: 40 }}>Chargement...</p>;
  if (!dossier) return <p style={{ textAlign: 'center', padding: 40 }}>Dossier introuvable</p>;

  const workflowSteps = ['draft', 'submitted', 'verification', 'review', 'committee', 'decided', 'exported', 'disbursed', 'monitoring', 'closed'];
  const currentIdx = workflowSteps.indexOf(dossier.status);

  return (
    <div>
      <button className="btn btn-sm btn-secondary" style={{ marginBottom: 16 }} onClick={() => navigate('/dossiers')}>
        <ArrowLeft size={14} /> Retour aux dossiers
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{dossier.applicant_name || 'Dossier sans nom'}</h1>
          <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>{dossier.applicant_location} — {dossier.activity_type || dossier.sector}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dossier.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('submitted')}>Soumettre</button>}
          {dossier.status === 'submitted' && user?.role !== 'AGENT' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('verification')}>Vérifier</button>}
          {dossier.status === 'verification' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('review')}>Passer en revue</button>}
          {dossier.status === 'review' && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus('committee')}>Envoyer au comité</button>}
        </div>
      </div>

      <div className="workflow-steps">
        {workflowSteps.map((s, i) => (
          <span key={s} className={`workflow-step ${i === currentIdx ? 'current' : i < currentIdx ? 'done' : ''}`}>
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      <div className="tabs">
        {TABS.map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Résumé' && <SummaryTab dossier={dossier} evidence={evidence} cashflow={cashflow} bicData={bicData} onCheckBic={checkBic} />}
      {tab === 'Preuves' && <EvidenceTab dossierId={id} evidence={evidence} onReload={loadDossier} />}
      {tab === 'Cash-flow' && <CashflowTab dossierId={id} cashflow={cashflow} dossier={dossier} onReload={loadDossier} />}
      {tab === 'Stress test' && <StressTab stressTests={stressTests} onRun={runStressTest} dossier={dossier} />}
      {tab === 'Préqualification' && <PrequalTab dossier={dossier} ruleEvals={ruleEvals} riskFlags={riskFlags} onEvaluate={evaluateRules} />}
      {tab === 'Décision' && <DecisionTab dossier={dossier} onReload={loadDossier} />}
      {tab === 'Audit' && <AuditTab logs={auditLogs} />}
    </div>
  );
}

function SummaryTab({ dossier, evidence, cashflow, bicData, onCheckBic }) {
  const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalExpenses = cashflow.reduce((s, e) => s + (e.expenses || 0), 0);

  return (
    <div className="grid-2">
      <div className="card">
        <div className="memo-section">
          <div className="memo-section-title">Identité</div>
          <p><strong>{dossier.applicant_name}</strong></p>
          <p>{dossier.applicant_phone} — {dossier.applicant_id_number}</p>
          <p>{dossier.applicant_location}</p>
        </div>
        <div className="memo-section">
          <div className="memo-section-title">Activité</div>
          <p>{dossier.sector} — {dossier.activity_type}</p>
          <p>{dossier.years_experience} ans d'expérience — {dossier.surface_ha} ha</p>
          <p>Cycle: {dossier.production_cycle}</p>
        </div>
        <div className="memo-section">
          <div className="memo-section-title">Crédit demandé</div>
          <p style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatCFA(dossier.amount_requested)}</p>
          <p>{dossier.credit_purpose}</p>
          <p>Durée: {dossier.duration_months} mois — {dossier.desired_schedule}</p>
        </div>
        <div className="memo-section">
          <div className="memo-section-title">Garanties</div>
          <p>Épargne: {formatCFA(dossier.savings_amount)}</p>
          <p>Type: {dossier.guarantee_type}</p>
          <p>{dossier.group_guarantee}</p>
        </div>
      </div>

      <div>
        {dossier.prequalification && (
          <div className={`prequal-result ${prequalColor(dossier.prequalification)}`} style={{ marginBottom: 16 }}>
            <div className="prequal-label">{prequalLabel(dossier.prequalification)}</div>
            <div style={{ fontSize: '0.8rem' }}>
              Evidence: <strong>{dossier.evidence_confidence || '—'}</strong> | Capacité: <strong>{dossier.repayment_capacity || '—'}</strong>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="memo-section-title">Cash-flow annuel</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div><span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Revenus</span><br /><strong style={{ color: '#38a169' }}>{formatCFA(totalRevenue)}</strong></div>
            <div><span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Charges</span><br /><strong style={{ color: '#dc2626' }}>{formatCFA(totalExpenses)}</strong></div>
            <div><span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Net</span><br /><strong>{formatCFA(totalRevenue - totalExpenses)}</strong></div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="memo-section-title">Preuves ({evidence.length})</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {['A', 'B', 'C', 'D'].map(l => {
              const count = evidence.filter(e => e.verification_level === l).length;
              return <span key={l} className="badge" style={{ background: VERIFICATION_LEVELS[l].color, color: VERIFICATION_LEVELS[l].textColor }}>{l}: {count}</span>;
            })}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="memo-section-title" style={{ margin: 0 }}>BIC — Données simulées</div>
            <button className="btn btn-sm btn-secondary" onClick={onCheckBic}>Consulter</button>
          </div>
          {bicData && (
            <div style={{ marginTop: 12 }}>
              {bicData.summary.total_records === 0 ? (
                <p style={{ color: '#38a169', fontSize: '0.85rem' }}>Aucun crédit existant trouvé</p>
              ) : (
                <div>
                  <p style={{ fontSize: '0.85rem' }}><strong>{bicData.summary.total_records}</strong> crédit(s) — Encours: <strong>{formatCFA(bicData.summary.total_outstanding)}</strong></p>
                  {bicData.summary.has_late_payments && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>Retard de paiement détecté ({bicData.summary.max_days_late} jours)</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {dossier.agent_note && (
          <div className="card">
            <div className="memo-section-title">Note de l'agent</div>
            <p style={{ fontSize: '0.85rem', marginTop: 8 }}>{dossier.agent_note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceTab({ dossierId, evidence, onReload }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ category: 'VENTE', label: '', amount: '', source: '', source_detail: '', verification_level: 'D', evidence_date: '' });

  async function handleAdd() {
    try {
      const data = { dossier_id: dossierId, ...form, amount: form.amount ? Number(form.amount) : null };
      if (isOnline()) {
        await api.addEvidence(data);
      } else {
        const id = crypto.randomUUID();
        await saveEvidenceOffline({ id, ...data });
        await addToSyncQueue({ operation: 'create', entity_type: 'evidence', entity_id: id, payload: data });
      }
      setAdding(false);
      setForm({ category: 'VENTE', label: '', amount: '', source: '', source_detail: '', verification_level: 'D', evidence_date: '' });
      onReload();
    } catch (err) { alert(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Evidence Ledger ({evidence.length} pièce(s))</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(!adding)}><Plus size={14} /> Ajouter</button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <select className="form-input form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="VENTE">Vente</option>
                <option value="LIVRAISON">Livraison</option>
                <option value="HISTORIQUE_IMF">Historique IMF</option>
                <option value="EPARGNE">Épargne</option>
                <option value="VISITE_TERRAIN">Visite terrain</option>
                <option value="DOCUMENT">Document</option>
                <option value="MOBILE_MONEY">Mobile Money (simulé)</option>
                <option value="BIC">BIC</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Niveau de vérification</label>
              <select className="form-input form-select" value={form.verification_level} onChange={e => setForm(f => ({ ...f, verification_level: e.target.value }))}>
                <option value="A">A — Vérifié auprès de la source</option>
                <option value="B">B — Tiers fiable</option>
                <option value="C">C — Document fourni non vérifié</option>
                <option value="D">D — Déclaration du demandeur</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Libellé *</label>
              <input className="form-input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Vente tomates Coopérative Notto" />
            </div>
            <div className="form-group">
              <label className="form-label">Montant (FCFA)</label>
              <input className="form-input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Date de la preuve</label>
              <input className="form-input" type="date" value={form.evidence_date} onChange={e => setForm(f => ({ ...f, evidence_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Source *</label>
              <input className="form-input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Ex: Coopérative, Système IMF..." />
            </div>
            <div className="form-group">
              <label className="form-label">Détail source</label>
              <input className="form-input" value={form.source_detail} onChange={e => setForm(f => ({ ...f, source_detail: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!form.label || !form.source}>Enregistrer</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </div>
      )}

      {evidence.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Aucune preuve au dossier</div>
      ) : (
        evidence.map(e => (
          <div key={e.id} className="evidence-item">
            <div className="evidence-level" style={{ background: VERIFICATION_LEVELS[e.verification_level]?.color, color: VERIFICATION_LEVELS[e.verification_level]?.textColor }}>
              {e.verification_level}
            </div>
            <div className="evidence-content">
              <div className="evidence-label">{e.label}</div>
              <div className="evidence-meta">
                {e.category} — {e.source} — {formatDate(e.evidence_date)}
                {e.amount && <> — <strong>{formatCFA(e.amount)}</strong></>}
              </div>
              <div className="evidence-meta">{VERIFICATION_LEVELS[e.verification_level]?.label}</div>
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
    try {
      await api.saveCashflow(dossierId, entries);
      setEditing(false);
      onReload();
    } catch (err) { alert(err.message); }
  }

  const totalRevenue = entries.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalExpenses = entries.reduce((s, e) => s + (e.expenses || 0), 0);
  const totalDebt = entries.reduce((s, e) => s + (e.debt_payments || 0), 0);
  const netFlow = totalRevenue - totalExpenses - totalDebt;
  const monthlyPayment = dossier.amount_requested && dossier.duration_months ? Math.ceil(dossier.amount_requested / dossier.duration_months) : 0;
  const maxBar = Math.max(...entries.map(e => Math.max(e.revenue || 0, (e.expenses || 0) + (e.debt_payments || 0))), 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Cash-flow saisonnier</h2>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing(!editing)}>{editing ? 'Annuler' : 'Modifier'}</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value" style={{ color: '#38a169', fontSize: '1.25rem' }}>{formatCFA(totalRevenue)}</div><div className="stat-label">Revenus annuels</div></div>
        <div className="stat-card"><div className="stat-value" style={{ color: '#dc2626', fontSize: '1.25rem' }}>{formatCFA(totalExpenses + totalDebt)}</div><div className="stat-label">Charges + dettes</div></div>
        <div className="stat-card"><div className="stat-value" style={{ fontSize: '1.25rem' }}>{formatCFA(netFlow)}</div><div className="stat-label">Flux net annuel</div></div>
        <div className="stat-card"><div className="stat-value" style={{ fontSize: '1.25rem' }}>{formatCFA(monthlyPayment)}</div><div className="stat-label">Échéance mensuelle</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="cashflow-bar">
          {entries.map((e, i) => {
            const rev = (e.revenue || 0) / maxBar * 150;
            const exp = ((e.expenses || 0) + (e.debt_payments || 0)) / maxBar * 150;
            return (
              <div key={i} className="cashflow-month">
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 150 }}>
                  <div className="cashflow-bar-positive" style={{ height: rev }} title={`Revenus: ${formatCFA(e.revenue)}`}></div>
                  <div className="cashflow-bar-negative" style={{ height: exp }} title={`Charges: ${formatCFA((e.expenses || 0) + (e.debt_payments || 0))}`}></div>
                </div>
                <div className="cashflow-month-label">{MONTHS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mois</th><th>Revenus</th><th>Charges</th><th>Dettes</th><th>Net</th></tr></thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td><strong>{MONTHS[i]}</strong></td>
                    <td><input type="number" className="form-input" style={{ width: 120 }} value={e.revenue} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], revenue: Number(ev.target.value) }; setEntries(n); }} /></td>
                    <td><input type="number" className="form-input" style={{ width: 120 }} value={e.expenses} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], expenses: Number(ev.target.value) }; setEntries(n); }} /></td>
                    <td><input type="number" className="form-input" style={{ width: 120 }} value={e.debt_payments} onChange={ev => { const n = [...entries]; n[i] = { ...n[i], debt_payments: Number(ev.target.value) }; setEntries(n); }} /></td>
                    <td style={{ fontWeight: 600, color: (e.revenue - e.expenses - e.debt_payments) >= 0 ? '#38a169' : '#dc2626' }}>{formatCFA(e.revenue - e.expenses - (e.debt_payments || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleSave}>Enregistrer le cash-flow</button>
        </div>
      )}
    </div>
  );
}

function StressTab({ stressTests, onRun, dossier }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Stress tests</h2>
        <button className="btn btn-sm btn-primary" onClick={onRun}><Play size={14} /> Lancer les scénarios</button>
      </div>

      {stressTests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Aucun stress test effectué. Cliquez sur "Lancer les scénarios".</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {stressTests.map(s => (
            <div key={s.id || s.scenario} className="card" style={{ borderLeft: `4px solid ${s.can_repay ? '#38a169' : '#dc2626'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{s.description}</strong>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>Revenus ajustés: {Math.round(s.revenue_adjustment * 100)}%</p>
                </div>
                <span className={`badge ${s.can_repay ? 'badge-green' : 'badge-red'}`}>
                  {s.can_repay ? 'Capacité OK' : 'Insuffisant'}
                </span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 24, fontSize: '0.85rem' }}>
                <span>Capacité mensuelle: <strong>{formatCFA(s.monthly_capacity)}</strong></span>
                <span>Marge: <strong>{s.margin_percent}%</strong></span>
              </div>
              <p style={{ marginTop: 8, fontSize: '0.8rem', color: s.can_repay ? '#166534' : '#991b1b', fontStyle: 'italic' }}>{s.recommendation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrequalTab({ dossier, ruleEvals, riskFlags, onEvaluate }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Préqualification</h2>
        <button className="btn btn-sm btn-primary" onClick={onEvaluate}><Play size={14} /> Évaluer les règles</button>
      </div>

      {dossier.prequalification && (
        <div className={`prequal-result ${prequalColor(dossier.prequalification)}`}>
          <div className="prequal-label">{prequalLabel(dossier.prequalification)}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12, fontSize: '0.85rem' }}>
            <span>Evidence Confidence: <strong>{dossier.evidence_confidence}</strong></span>
            <span>Repayment Capacity: <strong>{dossier.repayment_capacity}</strong></span>
          </div>
          {dossier.prequalification_reasons && (
            <ul className="prequal-reasons">
              {JSON.parse(dossier.prequalification_reasons || '[]').map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}

      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Évaluation des règles</h3>
      {ruleEvals.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Les règles n'ont pas encore été évaluées.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {ruleEvals.map(e => (
            <div key={e.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${e.triggered ? (e.result === 'NON_ELIGIBLE' ? '#dc2626' : '#d97706') : '#38a169'}` }}>
              {e.triggered ? (e.result === 'NON_ELIGIBLE' ? <XCircle size={18} color="#dc2626" /> : <AlertTriangle size={18} color="#d97706" />) : <CheckCircle size={18} color="#38a169" />}
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.85rem' }}>{e.rule_code || e.code} — {e.rule_name || e.name}</strong>
                {e.triggered && <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>{e.explanation}</p>}
              </div>
              {e.triggered && <span className={`badge ${e.result === 'NON_ELIGIBLE' ? 'badge-red' : 'badge-amber'}`}>{e.result === 'NON_ELIGIBLE' ? 'Non éligible' : 'Revue requise'}</span>}
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

  async function handleDecide() {
    if (!form.motif) return alert('Le motif est obligatoire');
    try {
      await api.decideDossier(dossier.id, form);
      onReload();
    } catch (err) { alert(err.message); }
  }

  if (dossier.decision) {
    const isOverride = dossier.decision_amount && dossier.decision_amount !== dossier.amount_requested;
    return (
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Décision du comité</h2>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            {dossier.decision === 'approved' ? <CheckCircle size={24} color="#38a169" /> : <XCircle size={24} color="#dc2626" />}
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{dossier.decision === 'approved' ? 'APPROUVÉ' : dossier.decision === 'refused' ? 'REFUSÉ' : dossier.decision === 'complement' ? 'COMPLÉMENT REQUIS' : 'MODIFIÉ'}</span>
            {isOverride && <span className="badge badge-amber">Override humain</span>}
          </div>
          {dossier.decision_amount && (
            <p>Montant accordé: <strong>{formatCFA(dossier.decision_amount)}</strong> {isOverride && <span style={{ color: '#d97706' }}>(demandé: {formatCFA(dossier.amount_requested)})</span>}</p>
          )}
          {dossier.decision_duration && <p>Durée: <strong>{dossier.decision_duration} mois</strong></p>}
          <p style={{ marginTop: 12 }}><strong>Motif:</strong> {dossier.decision_motif}</p>
          <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#6b7280' }}>Décidé le {formatDateTime(dossier.decided_at)}</p>
        </div>
      </div>
    );
  }

  if (!canDecide) {
    return <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>En attente de la décision du comité</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Décision du comité</h2>
      <div className="card">
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Décision</label>
            <select className="form-input form-select" value={form.decision} onChange={e => setForm(f => ({ ...f, decision: e.target.value }))}>
              <option value="approved">Approuver</option>
              <option value="refused">Refuser</option>
              <option value="complement">Demander complément</option>
              <option value="modified">Approuver avec modification</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Montant accordé (FCFA)</label>
            <input className="form-input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Durée (mois)</label>
            <input className="form-input" type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Calendrier</label>
            <input className="form-input" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} placeholder="Ex: Saisonnier mars-juin" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Motif (obligatoire) *</label>
            <textarea className="form-input" rows={3} value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} placeholder="Justification de la décision..." />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleDecide}>Valider la décision</button>
      </div>
    </div>
  );
}

function AuditTab({ logs }) {
  if (logs.length === 0) return <p style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>Aucune entrée d'audit</p>;

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Journal d'audit</h2>
      <div className="card">
        <div style={{ display: 'grid', gap: 0 }}>
          {logs.map(l => (
            <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 16, fontSize: '0.85rem' }}>
              <span style={{ color: '#6b7280', minWidth: 130 }}>{formatDateTime(l.created_at)}</span>
              <span style={{ fontWeight: 600, minWidth: 120 }}>{l.user_name}</span>
              <span style={{ flex: 1 }}>{l.action} {l.entity_type && `(${l.entity_type})`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
