import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Printer, Pencil, Send, CheckCircle2, XCircle, FileOutput, Wallet, Ban, MessageCircle, Loader2, FileText, Receipt, CalendarClock, CalendarDays, Banknote, TrendingUp, Check, UserRound } from 'lucide-react';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import RecordPaymentModal from '../../components/RecordPaymentModal.jsx';
import { Field } from '../../components/Field.jsx';
import { PageLoader, ErrorState } from '../../components/EmptyState.jsx';
import { useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDate, labelOf, PAYMENT_METHODS, addDays, today, daysUntil } from '../../utils/format';
import { whatsAppLink, fillTemplate } from '../../utils/whatsapp';
import { quotationsApi } from '../../api/quotationsApi';
import { DOC } from './docConfig';

// "in 5 days" / "Today" / "3 days ago" for a date (UI text only).
const relDays = (iso) => {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return 'Today';
  return n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} ago`;
};

export default function DocumentView({ kind }) {
  const c = DOC[kind]; const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const { can, fmt, business } = useAuth();
  const { data: d, loading, error, reload } = useAsync(() => c.api.get(id), [id, kind]);
  const [dlg, setDlg] = useState(null); const [busy, setBusy] = useState(false);
  const [dueDate, setDueDate] = useState(addDays(today(), business?.settings?.invoiceDueDays || 14));
  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  const biz = d.business || business; const cust = d.customer || {};
  const isInv = kind === 'invoice';

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast.success(okMsg); setDlg(null); return r; } catch (e) { toast.error(e.message); setDlg(null); return null; } finally { setBusy(false); }
  };
  const setStatus = (s, msg) => run(() => c.api.setStatus(id, s), msg).then((r) => r && reload());
  async function convert() {
    const r = await run(() => quotationsApi.convertToInvoice(id, { dueDate }), 'Quotation converted to an invoice.');
    if (r) nav(`/invoices/${r.invoice.id}`);
  }
  const waMsg = fillTemplate(biz?.settings?.whatsappTemplate, { name: cust.name, business: biz?.name, message: `${c.label} ${d.number} for ${fmt(d.total)}${isInv ? ` (balance ${fmt(d.balance)})` : ''}.` });
  const wa = biz?.settings?.notifications?.whatsapp !== false && whatsAppLink(cust.phone, waMsg, biz?.settings?.defaultCountryCode);
  const canPay = isInv && d.storedStatus === 'issued' && d.balance > 0 && can('payments', 'create');
  const items = d.items || [];
  const Icon = isInv ? Receipt : FileText;

  // ---------- progress tracker + summary figures (computed from the loaded document) ----------
  const stages = isInv
    ? [['draft', 'Draft'], ['issued', 'Issued'], ['partially_paid', 'Partially paid'], ['paid', 'Paid']]
    : [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['converted', 'Invoiced']];
  let stageIdx;
  if (isInv) {
    const paidAll = d.status === 'paid' || (d.total > 0 && d.balance <= 0);
    stageIdx = d.storedStatus === 'cancelled' ? -1 : d.storedStatus === 'draft' ? 0 : paidAll ? 3 : d.paid > 0 ? 2 : 1;
  } else if (d.storedStatus === 'rejected') stageIdx = -1;
  else if (d.invoiceId) stageIdx = 3;
  else stageIdx = Math.max(0, stages.findIndex(([k]) => k === (d.status === 'expired' ? 'sent' : d.storedStatus)));
  const second = d[c.secondKey];
  const banner = isInv
    ? (d.storedStatus === 'cancelled' ? { title: 'Cancelled', text: 'This invoice can no longer be paid or re-opened.' }
      : d.status === 'overdue' ? { title: 'Overdue', text: `Payment was due on ${fmtDate(second)} (${relDays(second)}). Balance outstanding: ${fmt(d.balance)}.` } : null)
    : (d.storedStatus === 'rejected' ? { title: 'Rejected', text: 'The customer rejected this quotation.' }
      : d.status === 'expired' ? { title: 'Expired', text: `This quotation expired on ${fmtDate(second)} (${relDays(second)}).` } : null);
  const paidPct = d.total > 0 ? Math.min(100, Math.round(((d.paid || 0) / d.total) * 100)) : 0;
  const secondLate = isInv ? d.status === 'overdue' : d.status === 'expired';

  return (
    <div className="dash docview">
      <div className="crumbs no-print" role="navigation" aria-label="Breadcrumb"><Link to={c.base}>{c.plural}</Link><ChevronRight size={13} /><span>{d.number}</span></div>

      <section className="doc-top no-print">
        <div className="doc-top-main">
          <span className={`cell-av lg ${isInv ? 'av-0' : 'av-3'}`} aria-hidden="true"><Icon size={24} /></span>
          <div>
            <div className="profile-title"><h1>{c.label} {d.number}</h1><StatusBadge status={d.status} /></div>
            <p className="profile-sub">
              <span><UserRound size={14} />{d.customerId ? <Link to={`/customers/${d.customerId}`}>{d.customerName}</Link> : d.customerName}</span>
              <span><CalendarDays size={14} />{fmtDate(d.date)}</span>
            </p>
          </div>
        </div>
        <div className="profile-actions">
          <button type="button" className="btn sec sm" onClick={() => window.print()} title="Use your browser's Save as PDF option to export"><Printer size={14} />Print / PDF</button>
          {wa && <a className="btn green sm" href={wa} target="_blank" rel="noopener noreferrer" title="Opens WhatsApp. You must press Send there."><MessageCircle size={14} />WhatsApp</a>}
          {can(c.module, 'edit') && c.editable(d) && <button type="button" className="btn sec sm" onClick={() => nav(`${c.base}/${id}/edit`)}><Pencil size={14} />Edit</button>}
          {!isInv && can('quotations', 'edit') && d.storedStatus === 'draft' && <button type="button" className="btn sm" onClick={() => setStatus('sent', 'Marked as sent.')}><Send size={14} />Mark sent</button>}
          {!isInv && can('quotations', 'edit') && !d.invoiceId && ['sent'].includes(d.storedStatus) && <>
            <button type="button" className="btn green sm" onClick={() => setStatus('accepted', 'Marked as accepted.')}><CheckCircle2 size={14} />Accepted</button>
            <button type="button" className="btn red sm" onClick={() => setStatus('rejected', 'Marked as rejected.')}><XCircle size={14} />Rejected</button></>}
          {!isInv && d.storedStatus === 'accepted' && !d.invoiceId && can('quotations', 'manage') && can('invoices', 'create') && <button type="button" className="btn sm" onClick={() => setDlg('convert')}><FileOutput size={14} />Convert to invoice</button>}
          {isInv && d.storedStatus === 'draft' && can('invoices', 'edit') && <button type="button" className="btn sm" onClick={() => setStatus('issued', 'Invoice issued.')}><Send size={14} />Issue invoice</button>}
          {canPay && <button type="button" className="btn green sm" onClick={() => setDlg('pay')}><Wallet size={14} />Record payment</button>}
          {isInv && d.storedStatus !== 'cancelled' && can('invoices', 'manage') && <button type="button" className="btn red sm" onClick={() => setDlg('cancel')}><Ban size={14} />Cancel</button>}
        </div>
      </section>

      <section className="card pipeline-card no-print" aria-label={`${c.label} progress`}>
        <ol className="pipeline">
          {stages.map(([k, label], i) => (
            <li key={k} className={i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''} aria-current={i === stageIdx ? 'step' : undefined}>
              <span className="pl-dot">{i < stageIdx ? <Check size={14} /> : i + 1}</span>
              <span className="pl-label">{label}</span>
            </li>
          ))}
        </ol>
        {banner && <div className="lost-banner" role="status"><XCircle size={18} /><div><b>{banner.title}</b><p>{banner.text}</p></div></div>}
      </section>

      <div className="grid stats no-print">
        <StatCard icon={TrendingUp} tone="indigo" label="Total" value={fmt(d.total)} sub={`${items.length} line item${items.length === 1 ? '' : 's'}`} />
        {isInv && <StatCard icon={Wallet} tone="green" label="Amount paid" value={fmt(d.paid)} sub={`${paidPct}% of the total`} />}
        {isInv && <StatCard icon={Banknote} tone={d.balance > 0 ? 'red' : 'green'} label="Balance due" value={fmt(d.balance)} sub={d.balance > 0 ? 'Outstanding' : 'Settled'} />}
        <StatCard icon={CalendarClock} tone={secondLate ? 'red' : 'sky'} label={c.secondLabel} value={fmtDate(second)} sub={secondLate ? (isInv ? 'Overdue' : 'Expired') : relDays(second)} />
        {!isInv && d.invoiceId && <StatCard icon={Receipt} tone="green" label="Converted to invoice" value={d.invoiceNumber || 'Invoice'} sub="Open the invoice" to={`/invoices/${d.invoiceId}`} />}
      </div>

      <div className="doc">
        <div className="doc-head">
          <div>
            {biz?.logo && <img className="doc-logo" src={biz.logo} alt="" />}
            <b>{biz?.name}</b><div className="muted">{biz?.address}<br />{biz?.phone} {biz?.email && `- ${biz.email}`}</div>
          </div>
          <div className="right"><h2>{c.label}</h2><b>{d.number}</b><div><StatusBadge status={d.status} /></div></div>
        </div>
        <div className="doc-cols">
          <div><h4>Billed to</h4><b>{d.customerName}</b><div className="muted">{cust.phone}<br />{cust.email}<br />{cust.address}</div></div>
          <div className="right"><h4>Dates</h4><div>{c.label} date: <b>{fmtDate(d.date)}</b></div><div>{c.secondLabel}: <b>{fmtDate(d[c.secondKey])}</b></div>
            {!isInv && d.invoiceId && <div>Converted to: <Link to={`/invoices/${d.invoiceId}`}>{d.invoiceNumber || 'invoice'}</Link></div>}
            {isInv && d.quotationId && <div className="muted">From a quotation</div>}</div>
        </div>
        <div className="tw open">
          <table><thead><tr><th>Description</th><th className="right">Qty</th><th className="right">Unit price</th><th className="right">Disc. %</th><th className="right">Total</th></tr></thead>
            <tbody>{items.map((i, n) => <tr key={n}><td>{i.description}</td><td className="right">{i.qty}</td><td className="right">{fmt(i.unitPrice)}</td><td className="right">{i.discount || 0}</td><td className="right">{fmt(i.lineTotal)}</td></tr>)}</tbody></table>
        </div>
        <div className="totals mt">
          <div><span>Subtotal</span><span>{fmt(d.subtotal)}</span></div>
          <div><span>Discounts</span><span>-{fmt(d.discountTotal)}</span></div>
          <div><span>Tax ({d.taxRate}%)</span><span>{fmt(d.tax)}</span></div>
          <div className="grand"><span>Total</span><span>{fmt(d.total)}</span></div>
          {isInv && <><div><span>Amount paid</span><span>{fmt(d.paid)}</span></div><div className="grand line"><span>Balance due</span><span>{fmt(d.balance)}</span></div></>}
        </div>
        {d.notes && <div className="notes"><h4>Notes</h4>{d.notes}</div>}
        {d.terms && <div className="notes"><h4>Terms and conditions</h4>{d.terms}</div>}
      </div>

      {isInv && can('payments', 'view') && (
        <div className="card flush no-print">
          <div className="panel-head panel"><div><h3>Payment history</h3><p>Every payment is its own record, so partial payments are supported</p></div></div>
          {!d.payments?.length ? <p className="muted pad">No payments recorded yet.</p> : (
            <div className="tw"><table><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Transaction ID</th><th className="right">Amount</th><th>Status</th></tr></thead>
              <tbody>{d.payments.map((p) => <tr key={p.id}><td><Link className="cell-link" to={`/payments/${p.id}/receipt`}>{p.receiptNo}</Link></td><td>{fmtDate(p.date)}</td><td>{labelOf(PAYMENT_METHODS, p.method)}</td><td>{p.transactionId || '-'}</td><td className="right"><span className="price-cell">{fmt(p.amount)}</span></td><td><StatusBadge status={p.status} /></td></tr>)}</tbody></table></div>
          )}
        </div>
      )}

      {dlg === 'convert' && (
        <Modal title="Convert to invoice" onClose={() => setDlg(null)}>
          <p className="muted mb">An invoice will be created from this quotation. The original quotation is kept unchanged.</p>
          <Field label="Invoice due date" htmlFor="cv-due"><input id="cv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <div className="modal-foot"><button type="button" className="btn sec" onClick={() => setDlg(null)}>Cancel</button><button type="button" className="btn" disabled={busy} onClick={convert}>{busy && <Loader2 size={15} className="spin-i" />}Create invoice</button></div>
        </Modal>
      )}
      {dlg === 'pay' && <RecordPaymentModal target={{ type: 'invoice', id: d.id, label: d.number, balance: d.balance }} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reload(); }} />}
      {dlg === 'cancel' && <ConfirmDialog title="Cancel this invoice?" message="A cancelled invoice cannot be paid or re-opened. Invoices with completed payments cannot be cancelled until those payments are voided." confirmLabel="Cancel invoice" busy={busy} onCancel={() => setDlg(null)} onConfirm={() => setStatus('cancelled', 'Invoice cancelled.')} />}
    </div>
  );
}