import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Loader2, ShoppingBag } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import RecordPaymentModal from '../../components/RecordPaymentModal.jsx';
import LineItemsEditor, { blankItem, estimate } from '../../components/LineItemsEditor.jsx';
import { Field, CustomerPicker } from '../../components/Field.jsx';
import { purchasesApi } from '../../api/purchasesApi';
import { servicesApi } from '../../api/servicesApi';
import { packagesApi } from '../../api/packagesApi';
import { useAuth } from '../../context/AuthContext.jsx';
import { fmtDate, today } from '../../utils/format';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const TILE = { paid: 'av-2', partial: 'av-3', unpaid: 'av-4' };
const PAY_TABS = [{ value: '', label: 'All' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }, { value: 'paid', label: 'Paid' }];

function PurchaseForm({ initial, saving, errors, formError, onSubmit, onCancel, submitLabel }) {
  const { can, fmt } = useAuth();
  const [v, setV] = useState({ customer: null, date: today(), notes: '', ...initial, items: initial.items?.length ? initial.items.map((i) => ({ ...i, key: Math.random().toString(36).slice(2) })) : [blankItem()] });
  const [local, setLocal] = useState({}); const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    (async () => {
      const out = [];
      if (can('services', 'view')) (await servicesApi.list({ pageSize: 200, status: 'active' }).catch(() => ({ rows: [] }))).rows.forEach((s) => out.push({ type: 'service', id: s.id, name: s.name, price: s.price }));
      if (can('packages', 'view')) (await packagesApi.list({ pageSize: 200, status: 'active' }).catch(() => ({ rows: [] }))).rows.forEach((s) => out.push({ type: 'package', id: s.id, name: s.name, price: s.price }));
      setCatalog(out);
    })();
  }, [can]);
  const set = (k, val) => { setV((s) => ({ ...s, [k]: val })); setLocal((s) => ({ ...s, [k]: undefined })); };
  const submit = (e) => {
    e.preventDefault(); if (saving) return;
    const errs = {};
    if (!v.customer?.id) errs.customerId = 'Please select a customer.';
    if (!v.date) errs.date = 'Date is required.';
    if (v.items.some((i) => !i.description.trim() || !(Number(i.qty) > 0))) errs.items = 'Every line needs a description and a quantity above zero.';
    setLocal(errs); if (Object.keys(errs).length) return;
    onSubmit(v);
  };
  const err = { ...local, ...errors };
  const est = estimate(v.items, 0); // display only; the server calculates the saved total
  return (
    <form onSubmit={submit} noValidate>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <h4 className="form-section">Customer and date</h4>
      <div className="form-grid">
        <Field label="Customer" required full error={err.customerId}><CustomerPicker value={v.customer} onChange={(c) => set('customer', c)} /></Field>
        <Field label="Purchase date" required htmlFor="p-date" error={err.date}><input id="p-date" type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Notes" htmlFor="p-notes"><input id="p-notes" value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <h4 className="form-section">Services / packages purchased</h4>
      <LineItemsEditor items={v.items} onChange={(i) => set('items', i)} catalog={catalog} taxRate={0} showTax={false} error={err.items} />
      <div className="form-total"><span>Estimated total</span><b>{fmt(est.total)}</b></div>
      <div className="modal-foot"><button type="button" className="btn sec" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="btn" disabled={saving}>{saving && <Loader2 size={15} className="spin-i" />}{submitLabel}</button></div>
    </form>
  );
}

export default function PurchasesPage() {
  const { fmt, can } = useAuth();
  const [pay, setPay] = useState(null);
  return (
    <>
      <ResourceList
        title="Purchases and sales" subtitle="Record what customers bought. Link payments to see balances" entity="purchase" api={purchasesApi} module="purchases" wideForm FormComponent={PurchaseForm}
        searchPlaceholder="Search purchases..." defaultSort="date" defaultDir="desc"
        toForm={(r) => ({ customer: { id: r.customerId, name: r.customerName }, date: r.date, notes: r.notes, items: r.items, leadId: r.leadId })}
        toPayload={(v, row) => ({ customerId: v.customer.id, date: v.date, notes: v.notes, leadId: row ? undefined : v.leadId || undefined, items: v.items.map(({ key, ...i }) => ({ ...i, qty: Number(i.qty), unitPrice: Number(i.unitPrice), discount: Number(i.discount) || 0 })) })}
        /* Payment status is now a segmented tab bar (All / Unpaid / Partial / Paid) instead of a dropdown; it sends the same `paymentStatus` parameter. */
        tabs={PAY_TABS} tabParam="paymentStatus"
        filters={[{ name: 'status', label: 'Status', options: [{ value: 'recorded', label: 'Recorded' }, { value: 'cancelled', label: 'Cancelled' }] }]}
        deactivate={{ from: 'recorded', to: 'cancelled', action: 'delete', message: 'The purchase will be cancelled. Purchases with completed payments cannot be cancelled.' }}
        canEditRow={(r) => r.storedStatus === 'recorded' && !(r.paid > 0)}
        columns={[
          {
            key: 'date', label: 'Date', sortable: true,
            render: (r) => (
              <div className="cell-person">
                <span className={`cell-av ${r.storedStatus === 'cancelled' ? 'av-5' : TILE[r.paymentStatus] || 'av-0'}`} aria-hidden="true"><ShoppingBag size={18} /></span>
                <span className="cell-name">{fmtDate(r.date)}</span>
              </div>
            ),
          },
          {
            key: 'customerName', label: 'Customer', sortable: true,
            render: (r) => (
              <div className="cell-person">
                <span className={`cell-av sm av-${hueOf(r.customerName)}`} aria-hidden="true">{initials(r.customerName)}</span>
                <div>
                  {r.customerId ? <Link className="cell-link" to={`/customers/${r.customerId}`}>{r.customerName}</Link> : <span className="cell-name">{r.customerName}</span>}
                  {r.storedStatus === 'cancelled' && <span className="ent tl-grey tag">Cancelled</span>}
                  <small>{r.itemSummary}</small>
                </div>
              </div>
            ),
          },
          { key: 'total', label: 'Total', sortable: true, render: (r) => <span className={`price-cell${r.storedStatus === 'cancelled' ? ' struck' : ''}`}>{fmt(r.total)}</span> },
          {
            key: 'paid', label: 'Paid',
            render: (r) => { const pct = r.total > 0 ? Math.min(100, Math.round((r.paid / r.total) * 100)) : 0; return <div className="paid-cell"><span>{fmt(r.paid)}</span><span className="pay-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span></div>; },
          },
          { key: 'balance', label: 'Balance', render: (r) => <span className={`bal ${r.balance > 0 && r.storedStatus !== 'cancelled' ? 'bal-due' : 'bal-ok'}`}>{fmt(r.balance)}</span> },
          { key: 'paymentStatus', label: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus} /> },
        ]}
        rowActions={(r, { reload }) => can('payments', 'create') && r.storedStatus === 'recorded' && r.balance > 0 && (
          <button type="button" className="icon-btn ok" title="Record payment" aria-label="Record payment" onClick={() => setPay({ row: r, reload })}><Wallet size={16} /></button>
        )}
      />
      {pay && <RecordPaymentModal target={{ type: 'purchase', id: pay.row.id, label: `Purchase ${fmtDate(pay.row.date)} - ${pay.row.customerName}`, balance: pay.row.balance }} onClose={() => setPay(null)} onDone={() => { pay.reload(); setPay(null); }} />}
    </>
  );
}