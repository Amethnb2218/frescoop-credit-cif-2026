import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { formatCFA, formatDate, formatDateTime, STATUS_LABELS, MONTHS, prequalLabel, prequalColor, scoreStyle, parseScoreDetails } from '../lib/format';
import { EVIDENCE_LEVELS } from '../lib/tokens';
import { isOnline, addToSyncQueue, saveEvidenceOffline, deleteEvidenceOffline } from '../lib/offline';
import { ArrowLeft, Plus, Play, AlertTriangle, CheckCircle, XCircle, WifiOff, Shield, MapPin, FileCheck, Printer, Download, Trash2 } from 'lucide-react';
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
  const [actionError, setActionError] = useState('');

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
    if (!dossier?.id) return;
    try { const res = await api.checkBic(dossier.id); setBicData(res); } catch {}
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

      <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ScoreCircle score={dossier.prequalification_score} />
          <div>
            <h1 className="page-title">{dossier.applicant_name || 'Dossier'}</h1>
            <p className="page-subtitle">{dossier.applicant_location} · {dossier.activity_type || dossier.sector} · {formatCFA(dossier.amount_requested)}</p>
            {dossier.prequalification_score == null && <p className="text-xs text-muted" style={{ marginTop: 4 }}>Non calculé — données insuffisantes</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {ns && <button className="btn btn-primary btn-sm" onClick={() => advanceStatus(ns)}>{nextLabel[ns]}</button>}
          {dossier.status === 'committee' && ['COMITE', 'ADMIN', 'SUPERADMIN'].includes(role) && !dossier.decision && <button className="btn btn-primary btn-sm" onClick={() => setTab('Décision')}>Prendre une décision</button>}
        </div>
      </div>

      {dossier.prequalification_score != null && (() => {
        const style = scoreStyle(dossier.prequalification_score);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '10px 16px', background: '#f9fafb', borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 'var(--fs-12)', border: '1px solid var(--c-border-light)' }}>
            <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>Score technique : <span style={{ color: style.color, fontSize: 'var(--fs-md)' }}>{dossier.prequalification_score}/100</span></span>
            <span style={{ color: 'var(--c-500)' }}>|</span>
            <span>Confiance preuves: <strong>{dossier.evidence_confidence || '—'}</strong></span>
            <span style={{ color: 'var(--c-500)' }}>|</span>
            <span>Capacité: <strong>{dossier.repayment_capacity || '—'}</strong></span>
            <span style={{ color: 'var(--c-500)' }}>|</span>
            <span>{evidence.filter(e => ['A', 'B'].includes(e.verification_level)).length} preuves vérifiées</span>
          </div>
        );
      })()}

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
      {tab === 'Preuves' && <EvidenceTab dossierId={id} dossierStatus={dossier.status} evidence={evidence} onReload={loadDossier} />}
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
  const style = scoreStyle(score);
  return (
    <div aria-label={`${style.label}, score technique ${score} sur 100`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: style.background, border: `3px solid ${style.border}`, flexShrink: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: style.color }}>{score}</span>
    </div>
  );
}

function ScoreComponent({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ padding: 10, borderRadius: 'var(--radius-sm)', background: '#f9fafb', border: '1px solid var(--c-border-light)' }}>
      <div className="text-xs text-muted">{label}</div>
      <div style={{ fontWeight: 700, marginTop: 2 }}>{value.points}/{value.maximum}</div>
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
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginBottom: 4 }}>SCORE TECHNIQUE</div>
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
  const fluxNet = totalRevenue - totalExpenses - totalDebt;
  const monthlyPayment = dossier.amount_requested && dossier.duration_months ? Math.ceil(dossier.amount_requested / dossier.duration_months) : 0;
  const scoreVisual = scoreStyle(dossier.prequalification_score);
  const scoreDetails = parseScoreDetails(dossier.prequalification_score_details) || {};
  const capacityRatio = scoreDetails.capacity_ratio;
  const stressedRatio = scoreDetails.stressed_capacity_ratio;
  const averageMonthlyNet = scoreDetails.average_monthly_net;
  const monthlyMargin = scoreDetails.monthly_margin_after_payment;
  const paymentMonths = Array.isArray(scoreDetails.payment_months) ? scoreDetails.payment_months : [];
  const scheduleMinimumMargin = scoreDetails.schedule_minimum_margin;
  const stressedScheduleMinimumMargin = scoreDetails.stressed_schedule_minimum_margin;
  const capacityKnown = capacityRatio != null;

  return (
    <div>
      <div style={{ marginBottom: 20, padding: 18, borderRadius: 'var(--radius-md)', background: capacityKnown && capacityRatio >= 1.3 ? '#ecfdf5' : capacityKnown && capacityRatio >= 1 ? '#fffbeb' : '#fef2f2', border: `2px solid ${capacityKnown && capacityRatio >= 1.3 ? '#6ee7b7' : capacityKnown && capacityRatio >= 1 ? '#fcd34d' : '#fca5a5'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#475569' }}>Capacité de remboursement</div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, marginTop: 3 }}>{capacityKnown ? `${capacityRatio.toFixed(2)}× l’échéance` : 'Non calculé — données insuffisantes'}</div>
          </div>
          <span className={`badge ${dossier.repayment_capacity === 'SUFFICIENT' ? 'badge-success' : dossier.repayment_capacity === 'LIMIT' ? 'badge-warning' : 'badge-danger'}`}>
            {dossier.repayment_capacity === 'SUFFICIENT' ? 'Suffisante' : dossier.repayment_capacity === 'LIMIT' ? 'Limite' : dossier.repayment_capacity === 'INSUFFICIENT' ? 'Insuffisante' : 'Non calculable'}
          </span>
        </div>
        <div className="capacity-metrics">
          <div><div className="text-xs text-muted">Flux net mensuel moyen</div><strong>{averageMonthlyNet == null ? '—' : formatCFA(averageMonthlyNet)}</strong></div>
          <div><div className="text-xs text-muted">Échéance proposée</div><strong>{monthlyPayment ? formatCFA(monthlyPayment) : '—'}</strong></div>
          <div><div className="text-xs text-muted">Marge après échéance</div><strong>{monthlyMargin == null ? '—' : formatCFA(monthlyMargin)}</strong></div>
          <div><div className="text-xs text-muted">Stress revenus −20 %</div><strong>{stressedRatio == null ? '—' : `${stressedRatio.toFixed(2)}×`}</strong></div>
        </div>
        <div className="text-xs text-muted" style={{ marginTop: 12 }}>
          Calendrier : {scoreDetails.seasonal_schedule ? 'saisonnier prévu' : dossier.desired_schedule || 'non renseigné'} · Revenus observés sur {scoreDetails.revenue_months ?? '—'} mois.
          {paymentMonths.length > 0 && <> · Mois d’échéance : <strong>{paymentMonths.join(', ')}</strong></>}
          {scheduleMinimumMargin != null && <> · Marge minimale : <strong>{formatCFA(scheduleMinimumMargin)}</strong></>}
          {stressedScheduleMinimumMargin != null && <> · Marge minimale stressée : <strong>{formatCFA(stressedScheduleMinimumMargin)}</strong></>}
          {' '}L’orientation reste explicable et la décision finale appartient au comité habilité.
        </div>
      </div>

      {/* Score + Key metrics banner */}
      <div className={`summary-score-grid ${dossier.prequalification_score == null ? 'no-score' : ''}`}>
        {dossier.prequalification_score != null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, background: scoreVisual.background, borderRadius: 'var(--radius-md)', border: `2px solid ${scoreVisual.softBorder}` }}>
            <ScoreCircle score={dossier.prequalification_score} />
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginTop: 6, fontWeight: 600 }}>SCORE TECHNIQUE</div>
          </div>
        )}
        <div className="key-metrics-grid">
          <div style={{ padding: '12px 10px', background: '#f9fafb', borderRadius: 'var(--radius)', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Montant demandé</div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, marginTop: 2 }}>{formatCFA(dossier.amount_requested)}</div>
          </div>
          <div style={{ padding: '12px 10px', background: '#f9fafb', borderRadius: 'var(--radius)', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Durée</div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, marginTop: 2 }}>{dossier.duration_months} mois</div>
          </div>
          <div style={{ padding: '12px 10px', background: fluxNet >= 0 ? '#ecfdf5' : '#fef2f2', borderRadius: 'var(--radius)', textAlign: 'center', border: `1px solid ${fluxNet >= 0 ? '#a7f3d0' : '#fca5a5'}` }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Flux net annuel</div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, marginTop: 2, color: fluxNet >= 0 ? '#059669' : '#dc2626' }}>{formatCFA(fluxNet)}</div>
          </div>
          <div style={{ padding: '12px 10px', background: '#f9fafb', borderRadius: 'var(--radius)', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>Preuves</div>
            <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, marginTop: 2 }}>{evidence.length} <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 400, color: '#6b7280' }}>({evidence.filter(e => ['A','B'].includes(e.verification_level)).length} vérifiées)</span></div>
          </div>
        </div>
      </div>

      {/* Decision banner if exists */}
      {dossier.decision && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--radius-md)', borderLeft: `4px solid ${dossier.decision === 'approved' || dossier.decision === 'modified' ? '#059669' : dossier.decision === 'refused' ? '#dc2626' : '#d97706'}`, background: dossier.decision === 'approved' || dossier.decision === 'modified' ? '#ecfdf5' : dossier.decision === 'refused' ? '#fef2f2' : '#fffbeb', display: 'flex', alignItems: 'center', gap: 10 }}>
          {dossier.decision === 'approved' || dossier.decision === 'modified' ? <CheckCircle size={18} color="#059669" /> : dossier.decision === 'refused' ? <XCircle size={18} color="#dc2626" /> : <AlertTriangle size={18} color="#d97706" />}
          <div>
            <strong style={{ fontSize: 'var(--fs-13)' }}>{dossier.decision === 'approved' ? 'Crédit approuvé' : dossier.decision === 'refused' ? 'Crédit refusé' : dossier.decision === 'complement' ? 'Complément requis' : 'Approuvé avec modification'}</strong>
            {dossier.decision_amount && <span style={{ fontSize: 'var(--fs-12)', marginLeft: 12, color: '#374151' }}>{formatCFA(dossier.decision_amount)}</span>}
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* Left column - Applicant info */}
        <div className="surface">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1b6b52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(dossier.applicant_name || '?')[0]}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-md)' }}>{dossier.applicant_name}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280' }}>{dossier.applicant_phone} · {dossier.applicant_id_number}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: 'var(--fs-12)' }}>
            <div><span style={{ color: '#6b7280' }}>Localisation</span><div style={{ fontWeight: 500, marginTop: 2 }}>{dossier.applicant_location || '—'}</div></div>
            <div><span style={{ color: '#6b7280' }}>Filière</span><div style={{ fontWeight: 500, marginTop: 2 }}>{dossier.sector} · {dossier.activity_type}</div></div>
            <div><span style={{ color: '#6b7280' }}>Expérience</span><div style={{ fontWeight: 500, marginTop: 2 }}>{dossier.years_experience || '—'} ans</div></div>
            <div><span style={{ color: '#6b7280' }}>Surface</span><div style={{ fontWeight: 500, marginTop: 2 }}>{dossier.surface_ha || '—'} ha</div></div>
            <div><span style={{ color: '#6b7280' }}>Cycle production</span><div style={{ fontWeight: 500, marginTop: 2 }}>{dossier.production_cycle || '—'}</div></div>
            <div><span style={{ color: '#6b7280' }}>Calendrier</span><div style={{ fontWeight: 500, marginTop: 2 }}>{dossier.desired_schedule || '—'}</div></div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Objet du crédit</div>
            <p style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5 }}>{dossier.credit_purpose}</p>
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Garanties</div>
            <p style={{ fontSize: 'var(--fs-12)' }}>Épargne: {formatCFA(dossier.savings_amount)} · {dossier.guarantee_type || 'Non renseigné'}</p>
            {dossier.group_guarantee && <p style={{ fontSize: 'var(--fs-12)', color: '#6b7280', marginTop: 2 }}>{dossier.group_guarantee}</p>}
          </div>

          {dossier.agent_note && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Note de l'agent</div>
              <p style={{ fontSize: 'var(--fs-12)', fontStyle: 'italic', color: '#374151' }}>{dossier.agent_note}</p>
            </div>
          )}
        </div>

        {/* Right column - Financial */}
        <div>
          <div className="surface mb-4">
            <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 12 }}>Cash-flow annuel</div>
            <div className="cashflow-metrics">
              <div style={{ textAlign: 'center', padding: 10, background: '#ecfdf5', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#059669' }}>{formatCFA(totalRevenue)}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginTop: 2 }}>Revenus</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: '#fef2f2', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#dc2626' }}>{formatCFA(totalExpenses + totalDebt)}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginTop: 2 }}>Charges + dettes</div>
              </div>
              <div style={{ textAlign: 'center', padding: 10, background: fluxNet >= 0 ? '#ecfdf5' : '#fef2f2', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: fluxNet >= 0 ? '#059669' : '#dc2626' }}>{formatCFA(fluxNet)}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', marginTop: 2 }}>Flux net</div>
              </div>
            </div>
            {monthlyPayment > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#f3f4f6', borderRadius: 'var(--radius)', fontSize: 'var(--fs-12)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Échéance mensuelle estimée</span>
                <span style={{ fontWeight: 600 }}>{formatCFA(monthlyPayment)}</span>
              </div>
            )}
          </div>

          {dossier.prequalification && (
            <div className="surface mb-4" style={{ borderLeft: `3px solid ${prequalColor(dossier.prequalification) === 'green' ? '#059669' : prequalColor(dossier.prequalification) === 'amber' ? '#d97706' : '#dc2626'}` }}>
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Préqualification</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ padding: '3px 8px', borderRadius: 'var(--radius)', fontSize: 'var(--fs-12)', fontWeight: 600, background: prequalColor(dossier.prequalification) === 'green' ? '#d1fae5' : prequalColor(dossier.prequalification) === 'amber' ? '#fef3c7' : '#fee2e2', color: prequalColor(dossier.prequalification) === 'green' ? '#065f46' : prequalColor(dossier.prequalification) === 'amber' ? '#92400e' : '#991b1b' }}>{prequalLabel(dossier.prequalification)}</span>
              </div>
              <div className="prequal-metrics" style={{ marginTop: 10, fontSize: 'var(--fs-12)' }}>
                <div><span style={{ color: '#6b7280' }}>Confiance</span><div style={{ fontWeight: 600, marginTop: 2 }}>{dossier.evidence_confidence || '—'}</div></div>
                <div><span style={{ color: '#6b7280' }}>Capacité</span><div style={{ fontWeight: 600, marginTop: 2 }}>{dossier.repayment_capacity || '—'}</div></div>
                <div><span style={{ color: '#6b7280' }}>Preuves</span><div style={{ fontWeight: 600, marginTop: 2 }}>{evidence.length}</div></div>
              </div>
            </div>
          )}

          <div className="surface">
            <div className="flex justify-between items-center">
              <div style={{ fontSize: 'var(--fs-xs)', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>BIC</div>
              <button className="btn btn-secondary btn-sm" onClick={onCheckBic}>Consulter</button>
            </div>
            <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 'var(--radius)', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 'var(--fs-11)', fontWeight: 600 }}>
              Données synthétiques de démonstration — BIC non connecté
            </div>
            {bicData && (
              <div style={{ marginTop: 12 }}>
                {bicData.summary.total_records === 0 ? (
                  <p style={{ fontSize: 'var(--fs-12)', color: '#059669' }}>Aucun crédit existant trouvé</p>
                ) : (
                  <div>
                    <p style={{ fontSize: 'var(--fs-12)' }}><strong>{bicData.summary.total_records}</strong> crédit(s) · Encours: <strong>{formatCFA(bicData.summary.total_outstanding)}</strong></p>
                    {bicData.summary.has_late_payments && <p style={{ fontSize: 'var(--fs-12)', color: '#dc2626', marginTop: 4 }}>Retard de paiement détecté ({bicData.summary.max_days_late} jours)</p>}
                  </div>
                )}
              </div>
            )}
          </div>
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

function evidenceMetadata(evidence) {
  if (!evidence?.metadata) return {};
  if (typeof evidence.metadata === 'object') return evidence.metadata;
  try { return JSON.parse(evidence.metadata); } catch { return {}; }
}

function emptyEvidenceForm() {
  return { category: 'VENTE', label: '', amount: '', source: '', source_detail: '', verification_level: 'D', evidence_date: '', file: null };
}

function EvidenceTab({ dossierId, dossierStatus, evidence, onReload }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyEvidenceForm);
  const [error, setError] = useState('');

  function closeForm() {
    setAdding(false);
    setEditingId(null);
    setForm(emptyEvidenceForm());
  }

  function editItem(item) {
    setEditingId(item.id);
    setAdding(true);
    setForm({
      category: item.category || 'VENTE', label: item.label || '', amount: item.amount || '',
      source: item.source || '', source_detail: item.source_detail || '',
      verification_level: ['C', 'D'].includes(item.verification_level) ? item.verification_level : 'C',
      evidence_date: item.evidence_date || '', file: null,
    });
  }

  async function handleSave() {
    setError('');
    try {
      if (form.file && (form.file.size > 2 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(form.file.type))) {
        throw new Error('Utilisez un fichier PDF, JPEG ou PNG de 2 Mo maximum.');
      }
      const evidenceId = editingId || crypto.randomUUID();
      const { file, ...fields } = form;
      const data = { id: evidenceId, dossier_id: dossierId, ...fields, amount: form.amount ? Number(form.amount) : null,
        verification_level: file ? 'C' : form.verification_level,
        metadata: file ? { file_name: file.name, file_type: file.type, file_size: file.size, upload_pending: true } : undefined };
      if (isOnline()) {
        if (editingId) await api.updateEvidence(evidenceId, fields);
        else await api.addEvidence(data);
        if (file) await api.saveEvidenceAttachment(evidenceId, {
          original_name: file.name,
          mime_type: file.type,
          content_base64: await fileToBase64(file),
        });
      } else {
        await saveEvidenceOffline({ ...data, metadata: file ? data.metadata : evidenceMetadata(evidence.find(item => item.id === evidenceId)) });
        await addToSyncQueue({ operation: editingId ? 'update' : 'create', entity_type: 'evidence', entity_id: evidenceId, payload: data });
        if (file) await addToSyncQueue({
          operation: 'attachment', entity_type: 'evidence', entity_id: evidenceId,
          payload: { dossier_id: dossierId, original_name: file.name, mime_type: file.type,
            content_base64: await fileToBase64(file) },
        });
      }
      closeForm();
      await onReload();
    } catch (err) { setError(err.message); }
  }

  async function downloadAttachment(item) {
    try {
      const { blob } = await api.downloadEvidenceAttachment(item.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = evidenceMetadata(item).file_name || 'piece-jointe';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Supprimer la preuve « ${item.label} » ?`)) return;
    setError('');
    try {
      if (isOnline()) {
        if (evidenceMetadata(item).file_name) await api.deleteEvidenceAttachment(item.id);
        await api.deleteEvidence(item.id);
      } else {
        await deleteEvidenceOffline(item.id);
        await addToSyncQueue({ operation: 'delete', entity_type: 'evidence', entity_id: item.id, payload: { dossier_id: dossierId } });
      }
      await onReload();
    } catch (err) { setError(err.message); }
  }

  const levelColors = { A: { bg: '#d1fae5', text: '#065f46' }, B: { bg: '#dbeafe', text: '#1e40af' }, C: { bg: '#fef3c7', text: '#92400e' }, D: { bg: '#f3f4f6', text: '#374151' } };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Preuves au dossier ({evidence.length})</h2>
          {['draft', 'incomplete'].includes(dossierStatus) && <button className="btn btn-primary btn-sm" onClick={() => {
            if (adding) closeForm();
            else { setAdding(true); setEditingId(null); setForm(emptyEvidenceForm()); }
          }}><Plus size={14} /> {adding ? 'Fermer' : 'Ajouter une preuve'}</button>}
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
                <option value="C">C — Document non vérifié</option>
                <option value="D">D — Déclaration</option>
              </select>
              <div className="field-hint">Les niveaux A et B sont attribués après vérification par un rôle habilité.</div>
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
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">Pièce jointe sécurisée</label>
              <input className="input" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => {
                const file = e.target.files?.[0] || null;
                if (file && file.size > 2 * 1024 * 1024) {
                  setError('Le fichier dépasse la limite de 2 Mo.');
                  e.target.value = '';
                  return;
                }
                setError('');
                setForm(f => ({ ...f, file, verification_level: file ? 'C' : f.verification_level }));
              }} />
              <div className="field-hint">PDF, JPEG ou PNG · 2 Mo maximum · téléchargement authentifié.</div>
            </div>
          </div>
          <div style={{ padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius)', marginTop: 12, marginBottom: 12, fontSize: 'var(--fs-11)', color: '#1e40af' }}>
            <strong>Stockage protégé :</strong> le fichier est contrôlé, limité à 2 Mo, empreinté en SHA-256 et n’est jamais exposé par une URL publique.
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!form.label || !form.source}>{editingId ? 'Enregistrer les modifications' : 'Enregistrer'}</button>
            <button className="btn btn-secondary btn-sm" onClick={closeForm}>Annuler</button>
          </div>
        </div>
      )}

      {evidence.length === 0 ? (
        <div className="surface"><div className="empty-state"><div className="empty-state-title">Aucune preuve au dossier</div><div className="empty-state-desc">Ajoutez des preuves pour renforcer le dossier de crédit.</div></div></div>
      ) : (
        evidence.map(e => {
          const metadata = evidenceMetadata(e);
          return (
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
              {metadata.file_name && <div className="evidence-meta" style={{ marginTop: 4 }}>Fichier : {metadata.file_name} · {Math.ceil((metadata.file_size || 0) / 1024)} Ko</div>}
            </div>
            <div className="flex gap-2">
              {metadata.file_name && <button className="btn btn-secondary btn-sm" onClick={() => downloadAttachment(e)}><Download size={13} /> Télécharger</button>}
              {['draft', 'incomplete'].includes(dossierStatus) && <button className="btn btn-secondary btn-sm" onClick={() => editItem(e)}>Modifier / remplacer</button>}
              {['draft', 'incomplete'].includes(dossierStatus) && <button className="btn btn-ghost btn-sm" onClick={() => deleteItem(e)} aria-label={`Supprimer ${e.label}`}><Trash2 size={13} /></button>}
            </div>
          </div>
          );
        })
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
  const scoreVisual = scoreStyle(dossier.prequalification_score);
  const scoreDetails = parseScoreDetails(dossier.prequalification_score_details);
  const components = scoreDetails?.components;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>Préqualification</h2>
        <button className="btn btn-primary btn-sm" onClick={onEvaluate}><Play size={14} /> Évaluer les règles</button>
      </div>

      {dossier.prequalification_score != null && (
        <div className="surface mb-4" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <ScoreCircle score={dossier.prequalification_score} />
            <div>
              <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700 }}>Score technique : {dossier.prequalification_score}/100</div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--c-500)', marginTop: 2 }}>{scoreVisual.label} — la préqualification reste déterminée par les règles bloquantes</div>
            </div>
          </div>
          {components && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 16 }}>
              <ScoreComponent label="Identité" value={components.identity} />
              <ScoreComponent label="Capacité" value={components.capacity} />
              <ScoreComponent label="Preuves" value={components.evidence} />
              <ScoreComponent label="Risques" value={components.risk} />
            </div>
          )}
          {scoreDetails && (
            <div className="text-xs text-muted" style={{ marginTop: 12 }}>
              Ratio de capacité : {scoreDetails.capacity_ratio == null ? 'non calculable' : scoreDetails.capacity_ratio.toFixed(2)}
              {scoreDetails.penalties?.length > 0 && ` · Pénalités : ${scoreDetails.penalties.map(item => `${item.code} (-${item.points})`).join(', ')}`}
              {` · Moteur v${scoreDetails.version || dossier.prequalification_score_version || 1}`}
            </div>
          )}
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
                  <div className="flag-desc">{typeof c.details === 'object' ? JSON.stringify(c.details) : c.details}</div>
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
