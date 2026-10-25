import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, Ban, CheckCircle2, XCircle } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import RecordPaymentModal from '../../components/RecordPaymentModal.jsx';
import { paymentsApi } from '../../api/paymentsApi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDate, labelOf, PAYMENT_METHODS } from '../../utils/format';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const STATUSES = ['pending', 'completed', 'failed', 'voided'];
const RECEIPT_TILE = { completed: 'av-2', pending: 'av-3', failed: 'av-4', voided: 'av-5' };

export default function PaymentsPage() {
  const { fmt, can } = useAuth(); const toast = useToast();
  const [dlg, setDlg] = useState(null); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(0);
  const manage = can('payments', 'manage');

  async function act(arg) {
    setBusy(true);
    try {
      if (dlg.type === 'void') await paymentsApi.void(dlg.row.id, arg);
      else await paymentsApi.setStatus(dlg.row.id, dlg.status);
      toast.success('Payment updated.'); dlg.reload(); setDlg(null);
    } catch (e) { toast.error(e.message); setDlg(null); } finally { setBusy(false); }
  }

  return (
    <>
      <ResourceList
        key={version} title="Payments" subtitle="Manual payment records with optional transaction IDs. Online gateways are not connected" entity="payment" api={paymentsApi} perm={{ create: false, edit: false }}
        searchPlaceholder="Search receipt, transaction ID, customer..." defaultSort="date" defaultDir="desc"
        headerActions={can('payments', 'create') && <button type="button" className="btn" onClick={() => setDlg({ type: 'new' })}><Plus size={16} />Record payment</button>}
        /* Status is now a segmented tab bar (All + each status) instead of a dropdown; it sends the same `status` parameter. */
        tabs={[{ value: '', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))]} tabParam="status"
        filters={[{ name: 'method', label: 'Method', options: PAYMENT_METHODS }]}
        columns={[
          {
            key: 'receiptNo', label: 'Receipt', sortable: true,
            render: (r) => (
              <div className="cell-person">
                <span className={`cell-av ${RECEIPT_TILE[r.status] || 'av-0'}`} aria-hidden="true"><Receipt size={18} /></span>
                <Link className="cell-link" to={`/payments/${r.id}/receipt`}>{r.receiptNo}</Link>
              </div>
            ),
          },
          { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
          { key: 'customerName', label: 'Customer', sortable: true, render: (r) => <span className="agent-chip"><span className={`cell-av sm av-${hueOf(r.customerName)}`} aria-hidden="true">{initials(r.customerName)}</span>{r.customerName}</span> },
          { key: 'targetNumber', label: 'For', render: (r) => (r.invoiceId ? <Link className="cell-link" to={`/invoices/${r.invoiceId}`}>{r.targetNumber}</Link> : (r.targetNumber || '-')) },
          { key: 'method', label: 'Method', render: (r) => <span className="src-chip">{labelOf(PAYMENT_METHODS, r.method)}</span> },
          { key: 'transactionId', label: 'Transaction ID', render: (r) => (r.transactionId ? <span className="mono">{r.transactionId}</span> : <span className="muted">-</span>) },
          { key: 'amount', label: 'Amount', sortable: true, render: (r) => <span className={`price-cell${['voided', 'failed'].includes(r.status) ? ' struck' : ''}`}>{fmt(r.amount)}</span> },
          { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rowActions={(r, { reload }) => (
          <>
            <Link className="icon-btn" to={`/payments/${r.id}/receipt`} title="View / print receipt" aria-label="View receipt"><Receipt size={16} /></Link>
            {manage && r.status === 'pending' && <button type="button" className="icon-btn ok" title="Confirm payment" aria-label="Confirm payment" onClick={() => setDlg({ type: 'status', status: 'completed', row: r, reload })}><CheckCircle2 size={16} /></button>}
            {manage && r.status === 'pending' && <button type="button" className="icon-btn danger" title="Mark failed" aria-label="Mark failed" onClick={() => setDlg({ type: 'status', status: 'failed', row: r, reload })}><XCircle size={16} /></button>}
            {manage && ['completed', 'pending'].includes(r.status) && <button type="button" className="icon-btn danger" title="Void payment" aria-label="Void payment" onClick={() => setDlg({ type: 'void', row: r, reload })}><Ban size={16} /></button>}
          </>
        )}
      />
      {dlg?.type === 'new' && <RecordPaymentModal onClose={() => setDlg(null)} onDone={() => { setDlg(null); setVersion((v) => v + 1); }} />}
      {dlg?.type === 'void' && <ConfirmDialog title={`Void payment ${dlg.row.receiptNo}?`} message="A voided payment no longer counts toward the paid amount. This cannot be undone." askReason reasonLabel="Reason for voiding" confirmLabel="Void payment" busy={busy} onCancel={() => setDlg(null)} onConfirm={act} />}
      {dlg?.type === 'status' && <ConfirmDialog title={dlg.status === 'completed' ? 'Confirm this payment?' : 'Mark payment as failed?'} danger={dlg.status === 'failed'} message={dlg.status === 'completed' ? 'The amount will count toward the paid total.' : 'The payment will not count toward the paid total.'} confirmLabel="Confirm" busy={busy} onCancel={() => setDlg(null)} onConfirm={() => act()} />}
    </>
  );
}