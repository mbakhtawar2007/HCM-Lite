// Dependency-free SVG charts (no chart package added). Colours come
// from CSS variables via chart-bar-*/chart-line classes, so charts work
// in light and dark themes. All data comes from the server dashboard
// responses the page already loads — nothing here invents numbers.
function truncate(s, n = 20) {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function HBarChart({ data, label, value, format = (v) => String(v), maxBars = 10 }) {
  const rows = (data || []).slice(0, maxBars);
  if (rows.length === 0) return <p className="muted">No data for this chart yet.</p>;
  const max = Math.max(...rows.map((r) => Number(value(r)) || 0), 1);
  const rowH = 30;
  const height = rows.length * rowH + 8;
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={`0 0 560 ${height}`} role="img" aria-label="Bar chart">
        {rows.map((r, i) => {
          const v = Number(value(r)) || 0;
          const w = Math.max((v / max) * 300, v > 0 ? 4 : 0);
          const y = 8 + i * rowH;
          return (
            <g key={i}>
              <text x="0" y={y + 15} textAnchor="start">
                <title>{label(r)}</title>
                {truncate(label(r))}
              </text>
              <rect className={`chart-bar-${(i % 5) + 1}`} x="170" y={y + 2} width={w} height="18" rx="4" />
              <text x={176 + w} y={y + 15}>
                {format(v)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({ data, format = (v) => String(v) }) {
  const rows = (data || []).filter((r) => Number(r.value) > 0);
  const total = rows.reduce((s, r) => s + Number(r.value), 0);
  if (total === 0) return <p className="muted">No data for this chart yet.</p>;
  const cx = 120;
  const cy = 120;
  const r = 80;
  let angle = -Math.PI / 2;
  const slices = rows.map((row, i) => {
    const frac = Number(row.value) / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = frac > 0.5 ? 1 : 0;
    return {
      row,
      frac,
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      cls: `chart-bar-${(i % 5) + 1}`,
      color: `var(--chart-${(i % 5) + 1})`,
    };
  });
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox="0 0 240 240" role="img" aria-label="Donut chart">
        {slices.map((s, i) => (
          <path key={i} className="donut-slice" d={s.d} style={{ fill: s.color }}>
            <title>{`${s.row.label}: ${format(s.row.value)} (${Math.round(s.frac * 100)}%)`}</title>
          </path>
        ))}
      </svg>
      <div className="chart-legend">
        {slices.map((s, i) => (
          <span key={i}>
            <span className="swatch" style={{ background: s.color }} /> {s.row.label}: {format(s.row.value)} (
            {Math.round(s.frac * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

export function LeaveUsageChart({ balances }) {
  const rows = balances || [];
  if (rows.length === 0) return <p className="muted">No data for this chart yet.</p>;
  const max = Math.max(...rows.map((b) => (b.quota === null ? b.used : Math.max(b.quota, b.used))), 1);
  const rowH = 30;
  const height = rows.length * rowH + 8;
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={`0 0 560 ${height}`} role="img" aria-label="Leave usage chart">
        {rows.map((b, i) => {
          const y = 8 + i * rowH;
          const barW = (b.quota === null ? b.used / max : b.quota / max) * 300;
          const usedW = b.quota === null || b.quota === 0 ? barW : Math.min(barW, (b.used / b.quota) * barW);
          return (
            <g key={i}>
              <text x="0" y={y + 15} textAnchor="start">
                <title>{b.name}</title>
                {truncate(b.name)}
              </text>
              <rect
                className="chart-bar-5"
                x="170"
                y={y + 2}
                width={Math.max(barW, b.used > 0 ? 4 : 0)}
                height="18"
                rx="4"
              />
              <rect className="chart-bar-1" x="170" y={y + 2} width={usedW} height="18" rx="4" />
              <text x={176 + Math.max(barW, 4)} y={y + 15}>
                {b.quota === null ? `${b.used} used (Unlimited)` : `${b.used} used · ${b.remaining} left of ${b.quota}`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span>
          <span className="swatch" style={{ background: 'var(--chart-1)' }} /> Used
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--chart-5)' }} /> Remaining (limited types only)
        </span>
      </div>
    </div>
  );
}

export function LineChart({ series, xLabels, format = (v) => String(v) }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <p className="muted">No data for this chart yet.</p>;
  const W = 560;
  const H = 220;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const max = Math.max(...all.map((p) => p.y), 1);
  const n = Math.max(...series.map((s) => s.points.length), 1);
  const x = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <div className="chart-card">
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend chart">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="chart-grid" x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} />
            <text x={padL - 6} y={y(max * f) + 4} textAnchor="end">
              {format(Math.round(max * f))}
            </text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = s.points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ');
          return (
            <g key={si}>
              <polyline className={s.lineClass || 'chart-line'} points={pts} />
              {s.points.map((p, i) => (
                <circle key={i} className={s.dotClass || 'chart-dot'} cx={x(i)} cy={y(p.y)} r="4">
                  <title>{`${xLabels?.[i] || ''}: ${format(p.y)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {xLabels && xLabels.length > 0 && (
          <>
            <text x={x(0)} y={H - 6} textAnchor="start">
              {xLabels[0]}
            </text>
            <text x={x(xLabels.length - 1)} y={H - 6} textAnchor="end">
              {xLabels[xLabels.length - 1]}
            </text>
          </>
        )}
      </svg>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={i}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" className={s.lineClass || 'chart-line'} />
            </svg>{' '}
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
