import { useMemo, useState } from 'react';

// Table with sticky header + horizontal scroll (CSS) and optional
// CLIENT-SIDE sorting on the current page only. The sort note says so
// plainly — it never pretends to be server sorting. Server-side search,
// filters and pagination stay in the page that owns the data.
export default function DataTable({ columns, rows, sortKeys = null, emptyText = 'No rows yet.' }) {
  const [sort, setSort] = useState(null);
  const display = useMemo(() => {
    if (!sort || !sortKeys) return rows;
    const get = sortKeys[sort.key];
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
      return sort.dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [rows, sort, sortKeys]);
  const toggle = (key) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };
  if (!rows || rows.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {sortKeys?.[c.key] ? (
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => toggle(c.key)}
                      aria-label={`Sort by ${c.label}`}
                    >
                      {c.label} {sort?.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={row._id || row.id || i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sortKeys && (
        <p className="sort-note">
          Sorting applies to this page only — server search, filters and pagination are unchanged.
        </p>
      )}
    </div>
  );
}
