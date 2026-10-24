import { Link } from 'react-router-dom';

export default function EmptyState({ icon = '○', title, text, actionLabel, actionTo, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {actionTo && <Link className="btn btn-primary" to={actionTo}>{actionLabel}</Link>}
      {onAction && <button type="button" className="btn btn-primary" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}
