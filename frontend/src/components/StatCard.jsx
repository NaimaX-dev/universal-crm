import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };

// icon, tone, label, value, sub, to: as before (icon is now optional).
// trend (optional): { dir: 'up' | 'down' | 'flat', text: '+12%' } shows a small coloured pill before the sub text.
// loading (optional): shows a placeholder card instead of the numbers.
export default function StatCard({ icon: Icon, tone = 'blue', label, value, sub, to, trend, loading = false }) {
  if (loading) {
    return <div className="stat is-loading" aria-busy="true" aria-label="Loading"><i className="skeleton sk-tile" /><div className="stat-body"><i className="skeleton sk-line" /><i className="skeleton sk-line short" /></div></div>;
  }
  const dir = trend?.dir || 'flat';
  const TrendIcon = TREND_ICON[dir] || Minus;
  const body = (
    <>
      {Icon && <div className={`stat-icon tone-${tone}`}><Icon size={19} /></div>}
      <div className="stat-body">
        <span>{label}</span><b>{value}</b>
        {(sub || trend) && <small>{trend && <em className={`trend ${dir}`}><TrendIcon size={12} />{trend.text}</em>}{sub}</small>}
      </div>
    </>
  );
  return to ? <Link to={to} className="stat">{body}</Link> : <div className="stat">{body}</div>;
}