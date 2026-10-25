import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { leadsApi } from '../../api/leadsApi';
import { useTeam } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { SOURCES, LEAD_STATUSES, PRIORITIES, labelOf, fmtDate, today } from '../../utils/format';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function Avatar({ name, small = false }) {
  return <span className={`cell-av av-${hueOf(name)}${small ? ' sm' : ''}`} aria-hidden="true">{initials(name)}</span>;
}
const isOpen = (status) => !['converted', 'lost'].includes(status);

// Follow-up date with an Overdue / Today hint (only for leads that are still open).
function DueCell({ r }) {
  if (!r.nextFollowUp) return <span className="muted">-</span>;
  const t = today();
  const late = isOpen(r.status) && r.nextFollowUp < t;
  const soon = isOpen(r.status) && r.nextFollowUp === t;
  return (
    <span className={`due${late ? ' late' : soon ? ' soon' : ''}`}>
      <CalendarClock size={13} />{fmtDate(r.nextFollowUp)}{late && <em>Overdue</em>}{soon && <em>Today</em>}
    </span>
  );
}

export default function LeadsPage() {
  const nav = useNavigate();
  const { user, can } = useAuth();
  const { team, options } = useTeam();
  const canAssign = can('leads', 'manage');
  const fields = [
    { name: 'customer', section: 'Customer', label: 'Customer', type: 'customer', required: true, allowNew: can('customers', 'create'), disabled: false },
    { name: 'source', section: 'Inquiry', label: 'Inquiry source', type: 'select', required: true, options: SOURCES },
    { name: 'priority', section: 'Inquiry', label: 'Priority', type: 'select', options: PRIORITIES },
    { name: 'inquiryDate', section: 'Inquiry', label: 'Inquiry date', type: 'date', required: true },
    { name: 'assignedTo', section: 'Follow-up and assignment', label: 'Assigned Agent', type: 'select', options, disabled: !canAssign, help: canAssign ? undefined : 'Leads you add are assigned to you.' },
    { name: 'nextFollowUp', section: 'Follow-up and assignment', label: 'Next follow-up date', type: 'date', help: 'Scheduling a follow-up also updates this date.' },
    { name: 'requirements', section: 'Details', label: 'Customer requirements', type: 'textarea' },
    { name: 'notes', section: 'Details', label: 'Notes', type: 'textarea' },
  ];
  return (
    <ResourceList
      title="Leads and inquiries" subtitle="Track every inquiry from first contact to conversion" entity="lead" api={leadsApi} module="leads" wideForm deletable
      searchPlaceholder="Search leads..." defaultSort="inquiryDate" defaultDir="desc" fields={fields}
      initialValues={{ inquiryDate: today(), source: '', priority: 'medium', assignedTo: user.id, customer: null }}
      toForm={(r) => ({ customer: { id: r.customerId, name: r.customerName }, source: r.source, priority: r.priority, inquiryDate: r.inquiryDate, assignedTo: r.assignedTo, nextFollowUp: r.nextFollowUp, requirements: r.requirements, notes: r.notes })}
      toPayload={(v, row) => {
        const base = { source: v.source, priority: v.priority, inquiryDate: v.inquiryDate, assignedTo: v.assignedTo || undefined, nextFollowUp: v.nextFollowUp, requirements: v.requirements, notes: v.notes };
        if (row) return base;
        return v.customer?.id ? { ...base, customerId: v.customer.id } : { ...base, newCustomer: v.customer?.newCustomer };
      }}
      onView={(r) => nav(`/leads/${r.id}`)}
      /* Status is now a segmented tab bar (All + each lead status) instead of a dropdown; it sends the same `status` parameter. */
      tabs={[{ value: '', label: 'All' }, ...LEAD_STATUSES]} tabParam="status"
      filters={[
        { name: 'source', label: 'Source', options: SOURCES },
        { name: 'priority', label: 'Priority', options: PRIORITIES },
        ...(can('leads', 'manage') || user.scope === 'all' ? [{ name: 'assignedTo', label: 'Agent', options: team.map((t) => ({ value: t.id, label: t.name })) }] : []),
      ]}
      columns={[
        {
          key: 'customerName', label: 'Customer', sortable: true,
          render: (r) => (
            <div className="cell-person">
              <Avatar name={r.customerName} />
              <div><Link className="cell-link" to={`/leads/${r.id}`}>{r.customerName}</Link><small>{r.requirements}</small></div>
            </div>
          ),
        },
        { key: 'source', label: 'Source', sortable: true, render: (r) => <span className="src-chip">{labelOf(SOURCES, r.source)}</span> },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
        { key: 'priority', label: 'Priority', sortable: true, render: (r) => <span className={`prio prio-${r.priority}`}><i />{r.priority}</span> },
        { key: 'assignedName', label: 'Agent', sortable: true, render: (r) => (r.assignedName ? <span className="agent-chip"><Avatar name={r.assignedName} small />{r.assignedName}</span> : <span className="muted">Unassigned</span>) },
        { key: 'nextFollowUp', label: 'Next follow-up', sortable: true, render: (r) => <DueCell r={r} /> },
        { key: 'inquiryDate', label: 'Inquiry date', sortable: true, render: (r) => fmtDate(r.inquiryDate) },
      ]}
    />
  );
}