import { Wrench, Clock } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { servicesApi } from '../../api/servicesApi';
import { useAuth } from '../../context/AuthContext.jsx';

// UI-only helper: a stable accent colour per category (falls back to the service name).
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

export default function ServicesPage() {
  const { fmt } = useAuth();
  const fields = [
    { name: 'name', section: 'Service', label: 'Service name', required: true },
    { name: 'category', section: 'Service', label: 'Category / type', placeholder: 'e.g. Consultation, Repair, Development' },
    { name: 'price', section: 'Pricing', label: 'Price', type: 'number', required: true, min: 0, step: '0.01' },
    { name: 'duration', section: 'Pricing', label: 'Duration', placeholder: 'e.g. 30 minutes, 2 hours, 1 day' },
    { name: 'description', section: 'Description', label: 'Description', type: 'textarea' },
  ];
  return (
    <ResourceList
      title="Services" subtitle="What your business sells. Reused in quotations, invoices and subscriptions" entity="service" api={servicesApi} module="services" deletable
      searchPlaceholder="Search services..." defaultSort="name" fields={fields} initialValues={{ price: '', duration: '' }}
      /* Status is now a segmented tab bar (All / Active / Inactive) instead of a dropdown; it sends the same `status` parameter. */
      tabs={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} tabParam="status"
      filters={[]}
      deactivate={{ from: 'active', to: 'inactive', message: 'Inactive services cannot be added to new documents. Existing records are unaffected.' }}
      columns={[
        {
          key: 'name', label: 'Service', sortable: true,
          render: (r) => (
            <div className="cell-person">
              <span className={`cell-av av-${hueOf(r.category || r.name)}`} aria-hidden="true"><Wrench size={18} /></span>
              <div><span className="cell-name">{r.name}</span><small>{r.description}</small></div>
            </div>
          ),
        },
        { key: 'category', label: 'Category', sortable: true, render: (r) => (r.category ? <span className="src-chip">{r.category}</span> : <span className="muted">-</span>) },
        { key: 'price', label: 'Price', sortable: true, render: (r) => <span className="price-cell">{fmt(r.price)}</span> },
        { key: 'duration', label: 'Duration', render: (r) => (r.duration ? <span className="cell-ico"><Clock size={13} />{r.duration}</span> : <span className="muted">-</span>) },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}