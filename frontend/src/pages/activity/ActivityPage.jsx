import { UserRound, UserCog, Building2, Users, Target, CalendarClock, Wrench, Package, FileText, Receipt, Repeat, ShoppingBag, Wallet, Clock } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import { activityApi } from '../../api/activityApi';
import { fmtDateTime } from '../../utils/format';

const ENTITIES = ['user', 'agent', 'business', 'customer', 'lead', 'follow-up', 'service', 'package', 'quotation', 'invoice', 'subscription', 'purchase', 'payment'];

// ---------- small presentational helpers (UI only, no data logic) ----------
// Icon + colour per record type; unknown types fall back to a neutral clock.
const META = {
  user: [UserRound, 'tl-indigo'], agent: [UserCog, 'tl-violet'], business: [Building2, 'tl-sky'], customer: [Users, 'tl-indigo'], lead: [Target, 'tl-indigo'],
  'follow-up': [CalendarClock, 'tl-sky'], service: [Wrench, 'tl-amber'], package: [Package, 'tl-amber'], quotation: [FileText, 'tl-amber'],
  invoice: [Receipt, 'tl-violet'], subscription: [Repeat, 'tl-sky'], purchase: [ShoppingBag, 'tl-green'], payment: [Wallet, 'tl-green'],
};
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

// "just now", "5 min ago", "3h ago", "Yesterday", "4d ago" (older entries show only the exact time).
function ago(value) {
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return '';
  const mins = Math.floor((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  const days = Math.floor(mins / 1440);
  if (days === 1) return 'Yesterday';
  return days < 30 ? `${days}d ago` : '';
}

// Admin-only audit trail of important actions in this business.
export default function ActivityPage() {
  return (
    <ResourceList
      title="Activity log" subtitle="Who did what in your business (sign-ins, record changes, payments, access changes)" entity="activity entry" api={activityApi} perm={{ create: false, edit: false }}
      searchPlaceholder="Search activity or user..." defaultSort="createdAt" defaultDir="desc" pageSize={20}
      filters={[{ name: 'entity', label: 'Type', options: ENTITIES.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) })) }]}
      columns={[
        {
          key: 'createdAt', label: 'When', sortable: true,
          render: (r) => {
            const rel = ago(r.createdAt); const tone = (META[r.entity] || [Clock, 'tl-indigo'])[1];
            return <div className="when-cell"><i className={`stripe ${tone}`} aria-hidden="true" /><div className="due-cell"><b>{rel || fmtDateTime(r.createdAt)}</b>{rel && <small>{fmtDateTime(r.createdAt)}</small>}</div></div>;
          },
        },
        {
          key: 'userName', label: 'User', sortable: true,
          render: (r) => (r.userName
            ? <span className="agent-chip"><span className={`cell-av sm av-${hueOf(r.userName)}`} aria-hidden="true">{initials(r.userName)}</span>{r.userName}</span>
            : <span className="muted">System</span>),
        },
        {
          key: 'entity', label: 'Type', sortable: true,
          render: (r) => { const [Icon, tone] = META[r.entity] || [Clock, 'tl-indigo']; return <span className={`ent ${tone}`}><Icon size={13} />{r.entity}</span>; },
        },
        { key: 'text', label: 'What happened', render: (r) => <span className="act-text">{r.text}</span> },
      ]}
    />
  );
}