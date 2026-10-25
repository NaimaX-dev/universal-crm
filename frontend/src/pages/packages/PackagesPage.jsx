import { Package, Clock } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { packagesApi } from '../../api/packagesApi';
import { servicesApi } from '../../api/servicesApi';
import { useList } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';

// UI-only helper: a stable accent colour per package.
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const MAX_CHIPS = 3;

export default function PackagesPage() {
  const { fmt, can } = useAuth();
  const svc = useList(servicesApi.list, { pageSize: 200, status: 'active' }, can('services', 'view'));
  const all = useList(servicesApi.list, { pageSize: 200 }, can('services', 'view'));
  const nameOf = (id) => all.rows.find((s) => s.id === id)?.name || id;
  const fields = [
    { name: 'name', section: 'Package details', label: 'Package name', required: true },
    { name: 'price', section: 'Package details', label: 'Package price', type: 'number', required: true, min: 0, step: '0.01' },
    { name: 'duration', section: 'Package details', label: 'Duration / validity', placeholder: 'e.g. 12 months, 10 sessions' },
    { name: 'serviceIds', section: 'Included services', label: 'Included services', type: 'multiselect', options: svc.rows.map((s) => ({ value: s.id, label: s.name })) },
    { name: 'description', section: 'Description', label: 'Description', type: 'textarea' },
  ];
  return (
    <ResourceList
      title="Packages" subtitle="Bundles and plans. Reused in quotations, invoices and subscriptions" entity="package" api={packagesApi} module="packages" deletable
      searchPlaceholder="Search packages..." defaultSort="name" fields={fields} initialValues={{ price: '', duration: '', serviceIds: [] }}
      /* Status is now a segmented tab bar (All / Active / Inactive) instead of a dropdown; it sends the same `status` parameter. */
      tabs={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} tabParam="status"
      filters={[]}
      deactivate={{ from: 'active', to: 'inactive', message: 'Inactive packages cannot be added to new documents. Existing records are unaffected.' }}
      columns={[
        {
          key: 'name', label: 'Package', sortable: true,
          render: (r) => (
            <div className="cell-person">
              <span className={`cell-av av-${hueOf(r.name)}`} aria-hidden="true"><Package size={18} /></span>
              <div><span className="cell-name">{r.name}</span><small>{r.description}</small></div>
            </div>
          ),
        },
        {
          key: 'serviceIds', label: 'Includes',
          render: (r) => {
            const names = (r.serviceIds || []).map((id) => String(nameOf(id)));
            if (!names.length) return <span className="muted">-</span>;
            const rest = names.slice(MAX_CHIPS);
            return (
              <div className="inc-list" title={names.join(', ')}>
                {names.slice(0, MAX_CHIPS).map((n, i) => <span key={`${n}-${i}`} className="src-chip">{n}</span>)}
                {rest.length > 0 && <span className="inc-more">+{rest.length} more</span>}
              </div>
            );
          },
        },
        { key: 'price', label: 'Price', sortable: true, render: (r) => <span className="price-cell">{fmt(r.price)}</span> },
        { key: 'duration', label: 'Duration', render: (r) => (r.duration ? <span className="cell-ico"><Clock size={13} />{r.duration}</span> : <span className="muted">-</span>) },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}