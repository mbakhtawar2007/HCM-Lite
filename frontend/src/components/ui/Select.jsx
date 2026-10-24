export default function Select({ label, hint, error, children, id, ...props }) {
  const inputId = id || (label ? `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);
  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      <select id={inputId} className={error ? 'input-error' : ''} aria-invalid={!!error} {...props}>
        {children}
      </select>
      {hint && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
