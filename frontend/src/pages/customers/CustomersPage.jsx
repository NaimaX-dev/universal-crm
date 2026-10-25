import { Link, useNavigate } from 'react-router-dom';
import { Phone, Mail } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { customersApi } from '../../api/customersApi';
import { useTeam } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';

// Small presentational helpers (UI only): initials avatar with a stable colour per name.
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function Avatar({ name, small = false }) {
  return <span className={`cell-av av-${hueOf(name)}${small ? ' sm' : ''}`} aria-hidden="true">{initials(name)}</span>;
}

export default function CustomersPage() {
  const nav = useNavigate();
  const { team, options } = useTeam();
  const { isAdmin, user } = useAuth();
  const canAssign = isAdmin || user.scope === 'all';
  const fields = [
    { name: 'name', label: 'Customer name', required: true },
    { name: 'company', label: 'Company / organisation' },
    { name: 'phone', label: 'Phone (with country code)', required: true, type: 'tel', placeholder: '+92 300 0000000' },
    { name: 'cnic', label: 'ID Card Number (CNIC)', placeholder: 'XXXXX-XXXXXXX-X' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'assignedTo', label: 'Assigned Agent', type: 'select', options, disabled: !canAssign, help: canAssign ? undefined : 'Customers you add are assigned to you.' },
    { name: 'address', label: 'Address', full: true },
    { name: 'details', label: 'Business-specific details', type: 'textarea', help: 'Anything specific to your business (e.g. patient age, travel preferences, device model, project type).' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return (
    <ResourceList
      title="Customers" subtitle="People and organizations your business serves" entity="customer" api={customersApi} module="customers" deletable
      searchPlaceholder="Search by name, phone, email or address..." defaultSort="name" fields={fields}
      initialValues={{ assignedTo: user.id }} onView={(r) => nav(`/customers/${r.id}`)}
      /* Status is now a segmented tab bar (All / Active / Inactive) instead of a dropdown; it sends the same `status` parameter. */
      tabs={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} tabParam="status"
      filters={[
        ...(canAssign ? [{ name: 'assignedTo', label: 'Agent', options: team.map((t) => ({ value: t.id, label: t.name })) }] : []),
      ]}
      deactivate={{ from: 'active', to: 'inactive', message: 'The customer is hidden from new selections. Their history is kept.' }}
      columns={[
        {
          key: 'name', label: 'Customer', sortable: true,
          render: (r) => (
            <div className="cell-person">
              <Avatar name={r.name} />
              <div><Link className="cell-link" to={`/customers/${r.id}`}>{r.name}</Link><small>{r.company || r.address}</small></div>
            </div>
          ),
        },
        {
          key: 'phone', label: 'Contact',
          render: (r) => (
            <>
              <span className="cell-ico"><Phone size={13} />{r.phone}</span>
              {r.email && <span className="cell-ico sub"><Mail size={13} />{r.email}</span>}
            </>
          ),
        },
        {
            key: 'cnic',
            label: 'ID Card Number',
           render: (r) => r.cnic || <span className="muted">—</span>,
             },
        {
          key: 'assignedName', label: 'Assigned Agent', sortable: true,
          render: (r) => (r.assignedName ? <span className="agent-chip"><Avatar name={r.assignedName} small />{r.assignedName}</span> : <span className="muted">Unassigned</span>),
        },
        { key: 'leadCount', label: 'Leads', sortable: true, render: (r) => <span className={`count-pill${r.leadCount > 0 ? ' has' : ''}`}>{r.leadCount ?? 0}</span> },
        { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}