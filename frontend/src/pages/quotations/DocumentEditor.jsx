import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2, Calculator } from 'lucide-react';
import { Field, CustomerPicker } from '../../components/Field.jsx';
import LineItemsEditor, { blankItem, estimate } from '../../components/LineItemsEditor.jsx';
import { PageLoader, ErrorState } from '../../components/EmptyState.jsx';
import { servicesApi } from '../../api/servicesApi';
import { packagesApi } from '../../api/packagesApi';
import { customersApi } from '../../api/customersApi';
import { useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { today, addDays, toLocalInput, fmtDate } from '../../utils/format';
import { DOC } from './docConfig';

export default function DocumentEditor({ kind }) {
  const c = DOC[kind]; const { id } = useParams(); const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast();
  const { business, can, fmt } = useAuth();
  const settings = business?.settings || {};
  const editing = Boolean(id);
  const [form, setForm] = useState(null); const [errors, setErrors] = useState({}); const [formError, setFormError] = useState(''); const [busy, setBusy] = useState('');
  const [catalog, setCatalog] = useState([]);

  const existing = useAsync(() => c.api.get(id), [id, kind], editing);

  // Load the catalog (services + packages) that can be reused on the document.
  useEffect(() => {
    const load = async () => {
      const out = [];
      if (can('services', 'view')) (await servicesApi.list({ pageSize: 200, status: 'active' }).catch(() => ({ rows: [] }))).rows.forEach((s) => out.push({ type: 'service', id: s.id, name: s.name, price: s.price }));
      if (can('packages', 'view')) (await packagesApi.list({ pageSize: 200, status: 'active' }).catch(() => ({ rows: [] }))).rows.forEach((s) => out.push({ type: 'package', id: s.id, name: s.name, price: s.price }));
      setCatalog(out);
    };
    load();
  }, [can]);

  // Build the starting form (new document, or the existing one).
  useEffect(() => {
    if (editing) {
      if (!existing.data) return;
      const d = existing.data;
      setForm({ customer: { id: d.customerId, name: d.customerName }, date: d.date, second: d[c.secondKey], taxRate: d.taxRate, notes: d.notes || '', terms: d.terms || '', items: d.items.map((i) => ({ ...i, key: Math.random().toString(36).slice(2) })), leadId: d.leadId });
    } else {
      const base = { customer: null, date: today(), second: addDays(today(), kind === 'quotation' ? settings.quotationValidityDays || 14 : settings.invoiceDueDays || 14), taxRate: settings.taxRate ?? 0, notes: '', terms: '', items: [blankItem()], leadId: sp.get('leadId') || '' };
      setForm(base);
      const cid = sp.get('customerId');
      if (cid) customersApi.get(cid).then((cu) => setForm((f) => ({ ...f, customer: { id: cu.id, name: cu.name, phone: cu.phone } }))).catch(() => setForm((f) => ({ ...f, customer: { id: cid, name: 'Selected customer' } })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, existing.data]);

  if (editing && existing.loading) return <PageLoader />;
  if (editing && existing.error) return <div className="card"><ErrorState message={existing.error} onRetry={existing.reload} /></div>;
  if (editing && existing.data && !c.editable(existing.data)) return <div className="card"><ErrorState message={`This ${c.label.toLowerCase()} can no longer be edited.`} /></div>;
  if (!form) return <PageLoader />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  async function save(thenStatus) {
    if (busy) return;
    const errs = {};
    if (!form.customer?.id) errs.customerId = 'Please select a customer.';
    if (form.items.some((i) => !i.description.trim())) errs.items = 'Every line needs a description.';
    else if (form.items.some((i) => !(Number(i.qty) > 0))) errs.items = 'Quantity must be greater than zero.';
    if (form.second < form.date) errs[c.secondKey] = `${c.secondLabel} cannot be before the ${c.label.toLowerCase()} date.`;
    setErrors(errs); setFormError(''); if (Object.keys(errs).length) return;
    setBusy(thenStatus || 'draft');
    const payload = { customerId: form.customer.id, leadId: form.leadId || undefined, date: form.date, [c.secondKey]: form.second, taxRate: Number(form.taxRate) || 0, notes: form.notes, terms: form.terms, items: form.items.map(({ key, ...i }) => ({ ...i, qty: Number(i.qty), unitPrice: Number(i.unitPrice), discount: Number(i.discount) || 0 })) };
    try {
      let saved;
      if (editing) { saved = await c.api.update(id, payload); if (thenStatus && saved.storedStatus !== thenStatus) saved = await c.api.setStatus(id, thenStatus); }
      else saved = await c.api.create({ ...payload, status: thenStatus || 'draft' });
      toast.success(`${c.label} ${saved.number} saved.`); nav(`${c.base}/${saved.id}`, { replace: true });
    } catch (e) { setErrors(e.errors || {}); setFormError(e.errors ? 'Please correct the highlighted fields.' : e.message); } finally { setBusy(''); }
  }

  const est = estimate(form.items, form.taxRate); // display only; the server recalculates on save
  const title = editing ? `Edit ${c.label.toLowerCase()} ${existing.data.number}` : `New ${c.label.toLowerCase()}`;

  return (
    <div className="dash editor">
      <div className="crumbs" role="navigation" aria-label="Breadcrumb"><Link to={c.base}>{c.plural}</Link><ChevronRight size={13} /><span>{title}</span></div>
      <section className="editor-head">
        <div><h1>{title}</h1><p>Totals shown here are estimates. The server calculates the saved figures.</p></div>
        <button type="button" className="btn sec sm" onClick={() => nav(editing ? `${c.base}/${id}` : c.base)}><ArrowLeft size={14} />Cancel</button>
      </section>
      {formError && <div className="form-error" role="alert">{formError}</div>}

      <div className="editor-grid">
        <div className="editor-main">
          <section className="card editor-card">
            <h3 className="step"><span>1</span>Customer and dates</h3>
            <div className="form-grid">
              <Field label="Customer" required full error={errors.customerId}><CustomerPicker value={form.customer} onChange={(v) => set('customer', v)} disabled={editing} /></Field>
              <Field label={`${c.label} date`} required htmlFor="d-date"><input id="d-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label={c.secondLabel} required htmlFor="d-second" error={errors[c.secondKey]}><input id="d-second" type="date" value={form.second} onChange={(e) => { set('second', e.target.value); }} /></Field>
            </div>
          </section>

          <section className="card editor-card">
            <h3 className="step"><span>2</span>Line items</h3>
            <LineItemsEditor items={form.items} onChange={(v) => set('items', v)} catalog={catalog} taxRate={form.taxRate} onTaxRate={(v) => set('taxRate', v)} error={errors.items} />
          </section>

          <section className="card editor-card">
            <h3 className="step"><span>3</span>Notes and terms</h3>
            <div className="form-grid">
              <Field label="Notes" htmlFor="d-notes"><textarea id="d-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
              <Field label="Terms and conditions" htmlFor="d-terms"><textarea id="d-terms" value={form.terms} onChange={(e) => set('terms', e.target.value)} /></Field>
            </div>
          </section>
        </div>

        <aside className="card editor-side" aria-label="Summary">
          <h3 className="card-title"><Calculator size={16} />Summary</h3>
          <dl className="sum-list">
            <div><dt>Customer</dt><dd>{form.customer?.name || <span className="muted">Not selected</span>}</dd></div>
            <div><dt>{c.label} date</dt><dd>{fmtDate(form.date)}</dd></div>
            <div><dt>{c.secondLabel}</dt><dd>{fmtDate(form.second)}</dd></div>
            <div><dt>Line items</dt><dd>{form.items.length}</dd></div>
          </dl>
          <div className="sum-total">
            <span>Estimated total</span><b>{fmt(est.total)}</b>
            <small>Subtotal {fmt(est.subtotal)} &middot; Discounts -{fmt(est.discount)} &middot; Tax {fmt(est.tax)}</small>
          </div>
          <div className="sum-actions">
            {kind === 'quotation' && <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => save('sent')}>{busy === 'sent' && <Loader2 size={15} className="spin-i" />}Save and mark as sent</button>}
            {kind === 'invoice' && <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => save('issued')}>{busy === 'issued' && <Loader2 size={15} className="spin-i" />}Save and issue</button>}
            <button type="button" className="btn sec" disabled={Boolean(busy)} onClick={() => save(editing ? undefined : 'draft')}>{busy === 'draft' && <Loader2 size={15} className="spin-i" />}{editing ? 'Save changes' : 'Save as draft'}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
void toLocalInput;