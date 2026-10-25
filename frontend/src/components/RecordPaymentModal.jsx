import { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import Modal from './Modal.jsx';
import { Field } from './Field.jsx';
import { paymentsApi } from '../api/paymentsApi';
import { invoicesApi } from '../api/invoicesApi';
import { purchasesApi } from '../api/purchasesApi';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PAYMENT_METHODS, today, fmtDate } from '../utils/format';

// Records a MANUAL payment. A transaction ID is only a reference note: it does not prove that money arrived.
// target (optional): { type: 'invoice' | 'purchase', id, label, balance }
export default function RecordPaymentModal({ target, onClose, onDone }) {
  const { fmt, can } = useAuth();
  const toast = useToast();
  const [type, setType] = useState(target?.type || (can('invoices', 'view') ? 'invoice' : 'purchase'));
  const [options, setOptions] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [loadingOpts, setLoadingOpts] = useState(false);
  const [targetId, setTargetId] = useState(target?.id || '');
  const [v, setV] = useState({ amount: target?.balance ?? '', date: today(), method: 'cash', transactionId: '', status: 'completed', notes: '' });
  const [errors, setErrors] = useState({}); const [formError, setFormError] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) return undefined;
    let live = true;
    setOptions([]); setTargetId(''); setLoadErr(''); setLoadingOpts(true);
    const api = type === 'invoice' ? invoicesApi : purchasesApi;
    api.list({ payable: 1, pageSize: 200 }).then((r) => { if (live) setOptions(r.rows); }).catch((e) => { if (live) setLoadErr(e.message); }).finally(() => { if (live) setLoadingOpts(false); });
    return () => { live = false; };
  }, [type, target]);

  const chosen = target || options.find((o) => o.id === targetId);
  const balance = target ? target.balance : chosen?.balance;
  const set = (k, val) => { setV((s) => ({ ...s, [k]: val })); setErrors((s) => ({ ...s, [k]: undefined })); };

  function pickTarget(id) { setTargetId(id); const o = options.find((x) => x.id === id); if (o) set('amount', o.balance); }

  async function submit(e) {
    e.preventDefault(); if (busy) return;
    const errs = {};
    if (!target && !targetId) errs.target = `Choose an ${type}.`;
    if (!(Number(v.amount) > 0)) errs.amount = 'Enter an amount greater than zero.';
    else if (balance !== undefined && Number(v.amount) > balance + 0.001) errs.amount = `Amount exceeds the remaining balance (${fmt(balance)}).`;
    if (!v.date) errs.date = 'Payment date is required.';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true); setFormError('');
    try {
      const body = { ...v, amount: Number(v.amount), [type === 'invoice' ? 'invoiceId' : 'purchaseId']: target?.id || targetId };
      const p = await paymentsApi.create(body);
      toast.success(`Payment ${p.receiptNo} recorded.`); onDone(p);
    } catch (ex) { setErrors(ex.errors || {}); setFormError(ex.errors ? 'Please correct the highlighted fields.' : ex.message); } finally { setBusy(false); }
  }

  // What is left after this payment (display only; the server decides).
  const amt = Number(v.amount) || 0;
  const left = balance !== undefined && amt > 0 ? balance - amt : null;
  const summaryLabel = target ? target.label : chosen ? `${type === 'invoice' ? chosen.number : fmtDate(chosen.date)} - ${chosen.customerName}` : '';

  return (
    <Modal title="Record payment" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} noValidate>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        {(target || chosen) && (
          <div className="pay-target">
            <span className="cell-av av-2" aria-hidden="true"><Wallet size={18} /></span>
            <div className="pay-target-main"><b>{summaryLabel}</b><small>{type === 'invoice' ? 'Invoice' : 'Purchase'}</small></div>
            <div className="pay-target-bal"><span>Balance</span><b>{fmt(balance)}</b></div>
          </div>
        )}
        <div className="form-grid">
          {!target && (
            <>
              <Field label="Payment for" htmlFor="rp-type">
                <select id="rp-type" value={type} onChange={(e) => setType(e.target.value)}>
                  {can('invoices', 'view') && <option value="invoice">An invoice</option>}
                  {can('purchases', 'view') && <option value="purchase">A purchase</option>}
                </select>
              </Field>
              <Field label={type === 'invoice' ? 'Invoice' : 'Purchase'} required htmlFor="rp-target" error={errors.target || errors.invoiceId || loadErr} help={!loadingOpts && !options.length && !loadErr ? `No ${type}s with an outstanding balance.` : undefined}>
                <select id="rp-target" value={targetId} onChange={(e) => pickTarget(e.target.value)} autoFocus>
                  <option value="">{loadingOpts ? 'Loading...' : 'Select...'}</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{type === 'invoice' ? o.number : o.date} - {o.customerName} (balance {fmt(o.balance)})</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Amount received" required htmlFor="rp-amount" error={errors.amount} help={balance !== undefined ? `Remaining balance: ${fmt(balance)}. Partial payments are allowed.` : undefined}>
            <input id="rp-amount" type="number" min="0" step="0.01" value={v.amount} onChange={(e) => set('amount', e.target.value)} autoFocus={Boolean(target)} />
            {balance > 0 && (
              <div className="quick-chips" aria-label="Quick amounts">
                <button type="button" className="qchip" onClick={() => set('amount', balance)}>Full balance</button>
                <button type="button" className="qchip" onClick={() => set('amount', Math.round((balance / 2) * 100) / 100)}>Half</button>
              </div>
            )}
            {left !== null && left >= -0.001 && <span className={`after-pay${left <= 0.001 ? '' : ' part'}`}>{left <= 0.001 ? 'This payment settles it in full.' : `Remaining after this payment: ${fmt(left)}`}</span>}
          </Field>
          <Field label="Payment date" required htmlFor="rp-date" error={errors.date}><input id="rp-date" type="date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Payment method" required htmlFor="rp-method" error={errors.method}><select id="rp-method" value={v.method} onChange={(e) => set('method', e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
          <Field label="Transaction / reference ID" htmlFor="rp-txn" error={errors.transactionId} help="Optional reference note. It does not verify that the transaction succeeded."><input id="rp-txn" value={v.transactionId} onChange={(e) => set('transactionId', e.target.value)} /></Field>
          <Field label="Status" htmlFor="rp-status" help="Use Pending if you are still waiting to confirm the money.">
            <select id="rp-status" value={v.status} onChange={(e) => set('status', e.target.value)}><option value="completed">Completed</option><option value="pending">Pending confirmation</option></select>
          </Field>
          <Field label="Notes" htmlFor="rp-notes" full><textarea id="rp-notes" value={v.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <div className="modal-foot"><button type="button" className="btn sec" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="btn green" disabled={busy}>{busy && <Loader2 size={15} className="spin-i" />}Record payment</button></div>
      </form>
    </Modal>
  );
}