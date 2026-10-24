export default function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <p>{message || 'Something went wrong loading this page.'}</p>
      {onRetry && <button type="button" className="btn btn-ghost" onClick={onRetry}>Retry</button>}
    </div>
  );
}
