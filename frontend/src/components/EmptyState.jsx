import { Inbox, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';

export function EmptyState({ title = 'Nothing here yet', text, action, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <div className="empty-art"><Icon size={26} /></div>
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty error" role="alert">
      <div className="empty-art"><AlertCircle size={26} /></div>
      <h4>Could not load data</h4>
      <p>{message}</p>
      {onRetry && <button type="button" className="btn sec sm" onClick={onRetry}><RefreshCw size={14} />Try again</button>}
    </div>
  );
}
// Placeholder bars while data loads. Pass cols to get a table-shaped placeholder (header + rows of cells).
export function Skeleton({ rows = 5, cols = 0 }) {
  if (cols > 0) {
    return (
      <div className="skeleton-table" aria-busy="true" aria-label="Loading" style={{ '--cols': cols }}>
        <div className="sk-row head">{Array.from({ length: cols }, (_, c) => <i key={c} className="skeleton" />)}</div>
        {Array.from({ length: rows }, (_, r) => <div key={r} className="sk-row">{Array.from({ length: cols }, (_, c) => <i key={c} className="skeleton" />)}</div>)}
      </div>
    );
  }
  return <div className="skeleton-wrap" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}
export function PageLoader({ text = 'Loading...' }) {
  return <div className="card page-loader" role="status"><Skeleton rows={6} /><span className="loader-text"><Loader2 size={14} className="spin-i" />{text}</span></div>;
}