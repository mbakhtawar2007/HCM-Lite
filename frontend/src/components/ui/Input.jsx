export default function Input({ label, error, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className={error ? 'input-error' : ''} {...props} />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
