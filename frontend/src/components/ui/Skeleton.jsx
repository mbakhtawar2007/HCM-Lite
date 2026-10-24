export function Skeleton({ lines = 3, widths }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: widths?.[i] || '100%' }} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div>
      <div className="skeleton" role="status" aria-label="Loading page">
        <div className="skeleton-line" style={{ width: '40%', height: '1.75rem' }} />
        <div className="skeleton-line" style={{ width: '70%' }} />
      </div>
      <br />
      <Skeleton lines={4} />
    </div>
  );
}
