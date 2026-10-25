import { Link, useNavigate } from 'react-router-dom';
import { FileText, Receipt, CalendarClock } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { fmtDate } from '../../utils/format';
import { DOC } from './docConfig';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function Avatar({ name, small = false }) {
  return <span className={`cell-av av-${hueOf(name)}${small ? ' sm' : ''}`} aria-hidden="true">{initials(name)}</span>;
}
const SECOND_FLAG = { overdue: 'Overdue', expired: 'Expired' };

// Paid amount with a thin progress bar (paid / total).
function PaidCell({ r, fmt }) {
  const pct = r.total > 0 ? Math.min(100, Math.round((r.paid / r.total) * 100)) : 0;
  return <div className="paid-cell"><span>{fmt(r.paid)}</span><span className="pay-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span></div>;
}

export default function DocumentsPage({ kind }) {
  const c = DOC[kind]; const nav = useNavigate(); const { fmt } = useAuth();
  const invoice = kind === 'invoice';
  const Icon = invoice ? Receipt : FileText;
  return (
    <ResourceList
      key={kind} title={c.plural} subtitle={invoice ? 'Bills sent to customers. Totals and balances are calculated by the server' : 'Price offers for customers. Accepted quotations can be converted to invoices'}
      entity={c.label.toLowerCase()} api={c.api} module={c.module} searchPlaceholder={`Search ${c.plural.toLowerCase()}...`} defaultSort="date" defaultDir="desc"
      createLabel={`New ${c.label.toLowerCase()}`}
      onCreate={() => nav(`${c.base}/new`)} onEdit={(r) => nav(`${c.base}/${r.id}/edit`)} onView={(r) => nav(`${c.base}/${r.id}`)} canEditRow={c.editable}
      /* Status is now a segmented tab bar (All + each status) instead of a dropdown; it sends the same `status` parameter. */
      tabs={[{ value: '', label: 'All' }, ...c.statuses]} tabParam="status"
      filters={[]}
      columns={[
        {
          key: 'number', label: 'Number', sortable: true,
          render: (r) => (
            <div className="cell-person">
              <span className={`cell-av ${invoice ? 'av-0' : 'av-3'}`} aria-hidden="true"><Icon size={18} /></span>
              <Link className="cell-link" to={`${c.base}/${r.id}`}>{r.number}</Link>
            </div>
          ),
        },
        { key: 'customerName', label: 'Customer', sortable: true, render: (r) => <span className="agent-chip"><Avatar name={r.customerName} small />{r.customerName}</span> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        {
          key: c.secondKey, label: c.secondLabel, sortable: true,
          render: (r) => { const flag = SECOND_FLAG[r.status]; return <span className={`due${flag ? ' late' : ''}`}><CalendarClock size={13} />{fmtDate(r[c.secondKey])}{flag && <em>{flag}</em>}</span>; },
        },
        { key: 'total', label: 'Total', sortable: true, render: (r) => <span className="price-cell">{fmt(r.total)}</span> },
        ...(invoice ? [
          { key: 'paid', label: 'Paid', render: (r) => <PaidCell r={r} fmt={fmt} /> },
          { key: 'balance', label: 'Balance', render: (r) => <span className={`bal ${r.balance > 0 ? 'bal-due' : 'bal-ok'}`}>{fmt(r.balance)}</span> },
        ] : []),
        { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}