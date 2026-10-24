// Rates from the API are ratios (0-1); null means "no denominator",
// shown honestly as "No data yet" rather than a dressed-up 0%.
export default function Rate({ value }) {
  if (value === null || value === undefined) return <span className="muted">No data yet</span>;
  return <span>{(value * 100).toFixed(1)}%</span>;
}
