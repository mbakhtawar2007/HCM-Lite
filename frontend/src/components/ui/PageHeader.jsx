import { useEffect } from 'react';
import { Link } from 'react-router-dom';

// Page title + breadcrumb. Sets document.title per page (previously
// every page was just "HCM Lite").
export default function PageHeader({ title, breadcrumb = [], actions, subtitle }) {
  useEffect(() => { document.title = `${title} · HCM Lite`; }, [title]);
  return (
    <div className="page-header">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {breadcrumb.map((c, i) => (
          <span key={i}> › {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</span>
        ))}
        <span> › {title}</span>
      </nav>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
