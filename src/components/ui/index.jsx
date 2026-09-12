import { forwardRef, useEffect, useId, useRef } from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  getMissingScoreData,
  isProvisionalScore,
  isScoreAvailable,
  scoreStyle,
} from '../../lib/format';

export function PageHeader({ eyebrow, title, subtitle, actions, children, className = '' }) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="page-header-copy">
        {eyebrow && <p className="page-context">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {(actions || children) && <div className="page-header-actions">{actions || children}</div>}
    </header>
  );
}

export function Panel({ as: Component = 'section', title, description, actions, action, children, className = '', ...props }) {
  const panelActions = actions ?? action;
  return (
    <Component className={`surface ${className}`.trim()} {...props}>
      {(title || description || panelActions) && (
        <div className="surface-header">
          <div>
            {title && <h2 className="surface-title">{title}</h2>}
            {description && <p className="surface-description">{description}</p>}
          </div>
          {panelActions && <div className="surface-actions">{panelActions}</div>}
        </div>
      )}
      {children}
    </Component>
  );
}

export function FormSection({ title, description, children, className = '', ...props }) {
  return (
    <section className={`form-section ${className}`.trim()} {...props}>
      {(title || description) && (
        <header className="form-section-header">
          {title && <h2 className="form-section-title">{title}</h2>}
          {description && <p className="form-section-description">{description}</p>}
        </header>
      )}
      <div className="form-section-body">{children}</div>
    </section>
  );
}

export const Button = forwardRef(function Button({ variant = 'primary', size, loading = false, className = '', children, disabled, type = 'button', ...props }, ref) {
  const classes = ['btn', `btn-${variant}`, size && `btn-${size}`, className].filter(Boolean).join(' ');
  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <LoaderCircle className="spin" size={15} aria-hidden="true" />}
      {children}
    </button>
  );
});

const ALERT_ICONS = { success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle, error: AlertCircle, info: Info };

export function Alert({ variant = 'info', tone, title, children, actions, icon, className = '', role, ...props }) {
  const alertVariant = tone || variant;
  const Icon = icon || ALERT_ICONS[alertVariant] || Info;
  const liveRole = role || (['danger', 'error'].includes(alertVariant) ? 'alert' : 'status');
  return (
    <div className={`alert alert-${alertVariant} ${className}`.trim()} role={liveRole} {...props}>
      <Icon className="alert-icon" size={18} aria-hidden="true" />
      <div className="alert-content">
        {title && <div className="alert-title">{title}</div>}
        {children && <div className="alert-message">{children}</div>}
      </div>
      {actions && <div className="alert-actions">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status, label, variant, tone, children, className = '' }) {
  const badgeTone = variant || tone || STATUS_COLORS[status] || 'gray';
  const toneClass = badgeTone === 'green' ? 'success' : badgeTone === 'amber' ? 'warning' : badgeTone === 'red' ? 'error' : badgeTone;
  return <span className={`badge badge-${toneClass} ${className}`.trim()}>{label || children || STATUS_LABELS[status] || status || 'En attente'}</span>;
}

export function ScoreBadge({ score, details, provisional, missingData, size = 'md', showLabel = false, className = '' }) {
  if (!isScoreAvailable(score)) {
    return <span className={`score-badge score-badge-empty score-badge-${size} ${className}`.trim()} aria-label="Score non calculé">—</span>;
  }
  const numericScore = Number(score);
  const style = scoreStyle(numericScore);
  const isProvisional = provisional ?? isProvisionalScore(details);
  const missing = missingData ?? getMissingScoreData(details);
  const description = `${numericScore} sur 100, ${style.label}${isProvisional ? ', score provisoire' : ', score définitif'}${missing.length ? `, ${missing.length} donnée${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''}` : ''}`;
  return (
    <span className={`score-badge-wrap ${className}`.trim()}>
      <span
        className={`score-badge score-badge-${size} ${isProvisional ? 'is-provisional' : ''}`}
        style={{ '--score-color': style.color, '--score-bg': style.background, '--score-border': style.border }}
        aria-label={description}
        title={description}
      >
        {numericScore}
      </span>
      {showLabel && <span className="score-badge-label">{isProvisional ? 'Provisoire' : 'Définitif'}</span>}
    </span>
  );
}

export function Metric({ label, value, detail, icon: Icon, tone = 'neutral', as: Component = 'div', className = '', ...props }) {
  return (
    <Component className={`metric-card metric-${tone} ${className}`.trim()} {...props}>
      <div className="metric-heading">
        <span className="metric-label">{label}</span>
        {Icon && <Icon className="metric-icon" size={17} aria-hidden="true" />}
      </div>
      <div className="metric-value">{value ?? '—'}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </Component>
  );
}

export function FormField({ id, label, hint, error, required, children, className = '' }) {
  const generatedId = useId();
  const fieldId = id || `field-${generatedId.replace(/:/g, '')}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const child = typeof children === 'function'
    ? children({ id: fieldId, 'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined, 'aria-invalid': !!error || undefined })
    : children;
  return (
    <div className={`field ${className}`.trim()}>
      {label && <label className="field-label" htmlFor={fieldId}>{label}{required && <span aria-hidden="true"> *</span>}</label>}
      {child}
      {hint && <div className="field-hint" id={hintId}>{hint}</div>}
      {error && <div className="field-error" id={errorId} role="alert">{error}</div>}
    </div>
  );
}

export function ResponsiveTable({ children, className = '', label }) {
  return <div className={`table-container ${className}`.trim()} role="region" aria-label={label} tabIndex="0">{children}</div>;
}

export function EmptyState({ icon: Icon = FilePlaceholder, title = 'Aucune donnée', description, action, className = '' }) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <div className="state-icon" aria-hidden="true"><Icon size={22} /></div>
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}

function FilePlaceholder(props) {
  return <FileIcon {...props} />;
}

function FileIcon({ size = 22, ...props }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/></svg>;
}

export function LoadingState({ label, message, className = '' }) {
  const text = label || message || 'Chargement...';
  return <div className={`loading-state ${className}`.trim()} role="status" aria-live="polite"><LoaderCircle className="spin" size={20} aria-hidden="true" /> {text}</div>;
}

export function ErrorState({ title = 'Impossible de charger les données', description, message, onRetry, retryLabel = 'Réessayer', className = '' }) {
  const details = description || message;
  return (
    <div className={`error-state ${className}`.trim()} role="alert">
      <div className="state-icon state-icon-error" aria-hidden="true"><AlertCircle size={22} /></div>
      <div className="empty-state-title">{title}</div>
      {details && <div className="empty-state-desc">{details}</div>}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

export function Dialog({ open, title, description, children, actions, footer, onClose, closeLabel = 'Fermer', className = '' }) {
  const dialogActions = actions ?? footer;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(item => !item.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div ref={dialogRef} className={`dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className="dialog-header">
          <div>
            <h2 className="dialog-title" id={titleId}>{title}</h2>
            {description && <p className="dialog-description" id={descriptionId}>{description}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}><X size={18} /></button>
        </header>
        <div className="dialog-body">{children}</div>
        {dialogActions && <footer className="dialog-actions">{dialogActions}</footer>}
      </div>
    </div>
  );
}
