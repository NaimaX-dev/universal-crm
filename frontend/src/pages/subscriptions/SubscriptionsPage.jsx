import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCcw, Pause, Play, Ban, Package, Wrench, Clock } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { Skeleton } from '../../components/EmptyState.jsx';
import { subscriptionsApi } from '../../api/subscriptionsApi';
import { servicesApi } from '../../api/servicesApi';
import { packagesApi } from '../../api/packagesApi';
import { useList, useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { BILLING_CYCLES, labelOf, fmtDate, fmtDateTime, today, daysUntil } from '../../utils/format';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const PER = { weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year', annually: 'year' };
const STATUSES = ['active', 'paused', 'cancelled', 'expired'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function Details({ row, onClose }) {
  const { fmt } = useAuth();
  const { data, loading } = useAsync(() => subscriptionsApi.get(row.id), [row.id]);
  const days = data ? daysUntil(data.nextBillingDate) : null;
  return (
    <Modal title={`${row.planName} - ${row.customerName}`} onClose={onClose} wide>
      {loading ? <Skeleton rows={4} /> : (
        <>
          <div className="sub-sum">
            <div className="sub-tile"><span>Price per cycle</span><b>{fmt(data.price)}</b><small>{labelOf(BILLING_CYCLES, data.billingCycle)}</small></div>
            <div className="sub-tile"><span>Next billing</span><b>{fmtDate(data.nextBillingDate)}</b><small>{days === null ? '' : days === 0 ? 'Today' : days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} overdue`}</small></div>
            <div className="sub-tile"><span>Status</span><b><StatusBadge status={data.status} /></b></div>
          </div>
          <dl className="kv mb"><div><dt>Billing</dt><dd>{labelOf(BILLING_CYCLES, data.billingCycle)} - {fmt(data.price)}</dd></div><div><dt>Status</dt><dd><StatusBadge status={data.status} /></dd></div>
            <div><dt>Started</dt><dd>{fmtDate(data.startDate)}</dd></div><div><dt>Ends</dt><dd>{data.endDate ? fmtDate(data.endDate) : 'No end date'}</dd></div><div><dt>Next billing date</dt><dd>{fmtDate(data.nextBillingDate)}</dd></div></dl>
          <h4 className="form-section">Associated invoices</h4>
          {!data.invoices?.length ? <p className="muted mb">No invoices yet. Use Renew to create the next invoice.</p> : (
            <div className="tw short mb"><table><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Status</th></tr></thead><tbody>{data.invoices.map((i) => <tr key={i.id}><td><Link className="cell-link" to={`/invoices/${i.id}`}>{i.number}</Link></td><td>{fmtDate(i.date)}</td><td><span className="price-cell">{fmt(i.total)}</span></td><td><StatusBadge status={i.status} /></td></tr>)}</tbody></table></div>
          )}
          <h4 className="form-section">History</h4>
          <ul className="tl">{[...data.history].reverse().map((h, i) => <li key={i}><span className="tl-ico tl-indigo"><Clock size={14} /></span><div><p>{h.text}</p><small>{fmtDateTime(h.at)}</small></div></li>)}</ul>
        </>
      )}
    </Modal>
  );
}

export default function SubscriptionsPage() {
  const { fmt, can } = useAuth(); const toast = useToast();
  const svc = useList(servicesApi.list, { pageSize: 200, status: 'active' }, can('services', 'view'));
  const pkg = useList(packagesApi.list, { pageSize: 200, status: 'active' }, can('packages', 'view'));
  const [dlg, setDlg] = useState(null); const [busy, setBusy] = useState(false);

  const fields = [
    { name: 'customer', section: 'Customer', label: 'Customer', type: 'customer', required: true },
    { name: 'planType', section: 'Plan', label: 'Plan type', type: 'select', required: true, options: [{ value: 'package', label: 'Package' }, { value: 'service', label: 'Service' }] },
    { name: 'planId', section: 'Plan', label: 'Plan', type: 'select', required: true, options: (v) => (v.planType === 'service' ? svc.rows : pkg.rows).map((p) => ({ value: p.id, label: `${p.name} (${fmt(p.price)})` })) },
    { name: 'billingCycle', section: 'Billing', label: 'Billing cycle', type: 'select', required: true, options: BILLING_CYCLES },
    { name: 'startDate', section: 'Billing', label: 'Start date', type: 'date', required: true },
    { name: 'endDate', section: 'Billing', label: 'End date (optional)', type: 'date' },
    { name: 'price', section: 'Billing', label: 'Price per cycle', type: 'number', min: 0, step: '0.01', help: "Leave blank to use the plan's price." },
    { name: 'nextBillingDate', section: 'Billing', label: 'Next billing date', type: 'date', help: 'Defaults to the start date.' },
  ];

  async function act() {
    setBusy(true);
    try {
      if (dlg.type === 'renew') { const r = await subscriptionsApi.renew(dlg.row.id); toast.success(`Renewal invoice ${r.invoice.number} created.`); }
      else { await subscriptionsApi.setStatus(dlg.row.id, dlg.status); toast.success(`Subscription ${dlg.status}.`); }
      dlg.reload(); setDlg(null);
    } catch (e) { toast.error(e.message); setDlg(null); } finally { setBusy(false); }
  }

  return (
    <>
      <ResourceList
        title="Subscriptions" subtitle="Track recurring customers and renewals. Billing is manual: no automatic charging happens" entity="subscription" api={subscriptionsApi} module="subscriptions" wideForm
        searchPlaceholder="Search subscriptions..." defaultSort="nextBillingDate" fields={fields}
        initialValues={{ customer: null, planType: 'package', planId: '', billingCycle: 'monthly', startDate: today(), endDate: '', price: '', nextBillingDate: '' }}
        toForm={(r) => ({ customer: { id: r.customerId, name: r.customerName }, planType: r.planType, planId: r.planId, billingCycle: r.billingCycle, startDate: r.startDate, endDate: r.endDate, price: r.price, nextBillingDate: r.nextBillingDate })}
        toPayload={(v, row) => ({ ...(row ? {} : { customerId: v.customer.id, planType: v.planType, planId: v.planId }), billingCycle: v.billingCycle, startDate: v.startDate, endDate: v.endDate, price: v.price, nextBillingDate: v.nextBillingDate })}
        onView={(r) => setDlg({ type: 'view', row: r })}
        /* Status is now a segmented tab bar (All + each status) instead of a dropdown; it sends the same `status` parameter. */
        tabs={[{ value: '', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: cap(s) }))]} tabParam="status"
        filters={[{ name: 'billingCycle', label: 'Cycle', options: BILLING_CYCLES }]}
        columns={[
          {
            key: 'customerName', label: 'Customer', sortable: true,
            render: (r) => (
              <div className="cell-person">
                <span className={`cell-av av-${hueOf(r.customerName)}`} aria-hidden="true">{initials(r.customerName)}</span>
                {r.customerId ? <Link className="cell-link" to={`/customers/${r.customerId}`}>{r.customerName}</Link> : <span className="cell-name">{r.customerName}</span>}
              </div>
            ),
          },
          {
            key: 'planName', label: 'Plan', sortable: true,
            render: (r) => (
              <div className="cell-person">
                <span className={`cell-av sm-sq av-${hueOf(r.planName)}`} aria-hidden="true">{r.planType === 'service' ? <Wrench size={16} /> : <Package size={16} />}</span>
                <div><span className="cell-name">{r.planName}</span><small>{r.planType}</small></div>
              </div>
            ),
          },
          { key: 'billingCycle', label: 'Cycle', render: (r) => <span className="src-chip">{labelOf(BILLING_CYCLES, r.billingCycle)}</span> },
          { key: 'price', label: 'Price', sortable: true, render: (r) => <span className="price-cell">{fmt(r.price)}{PER[r.billingCycle] && <span className="per">/{PER[r.billingCycle]}</span>}</span> },
          {
            key: 'nextBillingDate', label: 'Next billing', sortable: true,
            render: (r) => (
              <div className="due-cell"><b>{fmtDate(r.nextBillingDate)}</b>{r.renewingSoon && <span className={`due-rel ${r.daysToRenewal < 0 ? 'late' : 'soon'}`}>{r.daysToRenewal < 0 ? `${-r.daysToRenewal} days overdue` : `Renews in ${r.daysToRenewal} day(s)`}</span>}</div>
            ),
          },
          { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
        ]}
        canEditRow={(r) => r.storedStatus !== 'cancelled'}
        rowActions={(r, { reload }) => can('subscriptions', 'manage') && (
          <>
            {r.status === 'active' && can('invoices', 'create') && <button type="button" className="icon-btn ok" title="Renew: create the next invoice" aria-label="Renew" onClick={() => setDlg({ type: 'renew', row: r, reload })}><RefreshCcw size={16} /></button>}
            {r.storedStatus === 'active' && <button type="button" className="icon-btn" title="Pause" aria-label="Pause" onClick={() => setDlg({ type: 'status', status: 'paused', row: r, reload })}><Pause size={16} /></button>}
            {r.storedStatus === 'paused' && <button type="button" className="icon-btn ok" title="Resume" aria-label="Resume" onClick={() => setDlg({ type: 'status', status: 'active', row: r, reload })}><Play size={16} /></button>}
            {r.storedStatus !== 'cancelled' && <button type="button" className="icon-btn danger" title="Cancel subscription" aria-label="Cancel subscription" onClick={() => setDlg({ type: 'status', status: 'cancelled', row: r, reload })}><Ban size={16} /></button>}
          </>
        )}
      />
      {dlg?.type === 'view' && <Details row={dlg.row} onClose={() => setDlg(null)} />}
      {dlg?.type === 'renew' && <ConfirmDialog title="Create renewal invoice?" danger={false} confirmLabel="Create invoice" busy={busy} message={`An invoice for ${fmt(dlg.row.price)} will be created for ${dlg.row.customerName} and the next billing date will move forward. The customer is NOT charged automatically.`} onCancel={() => setDlg(null)} onConfirm={act} />}
      {dlg?.type === 'status' && <ConfirmDialog title={`Mark subscription as ${dlg.status}?`} danger={dlg.status === 'cancelled'} confirmLabel="Confirm" busy={busy} message={dlg.status === 'cancelled' ? 'A cancelled subscription cannot be reactivated.' : `The subscription will be ${dlg.status}.`} onCancel={() => setDlg(null)} onConfirm={act} />}
    </>
  );
}