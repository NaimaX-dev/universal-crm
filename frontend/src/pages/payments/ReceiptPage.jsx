import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, ChevronRight, Receipt, CalendarDays, UserRound, Wallet, TrendingUp, Banknote, XCircle } from 'lucide-react';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PageLoader, ErrorState } from '../../components/EmptyState.jsx';
import { paymentsApi } from '../../api/paymentsApi';
import { useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { fmtDate, labelOf, PAYMENT_METHODS } from '../../utils/format';

const TILE = { completed: 'av-2', pending: 'av-3', failed: 'av-4', voided: 'av-5' };

export default function ReceiptPage() {
  const { id } = useParams(); const nav = useNavigate(); const { fmt } = useAuth();
  const { data, loading, error, reload } = useAsync(() => paymentsApi.receipt(id), [id]);
  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  const { payment: p, customer, business, document: doc } = data;
  const paidPct = doc && doc.total > 0 ? Math.min(100, Math.round(((doc.paid || 0) / doc.total) * 100)) : 0;
  const stamp = ['voided', 'failed', 'pending'].includes(p.status) ? p.status : null;
  return (
    <div className="dash docview">
      <div className="crumbs no-print" role="navigation" aria-label="Breadcrumb"><Link to="/payments">Payments</Link><ChevronRight size={13} /><span>Receipt {p.receiptNo}</span></div>

      <section className="doc-top no-print">
        <div className="doc-top-main">
          <span className={`cell-av lg ${TILE[p.status] || 'av-0'}`} aria-hidden="true"><Receipt size={24} /></span>
          <div>
            <div className="profile-title"><h1>Receipt {p.receiptNo}</h1><StatusBadge status={p.status} /></div>
            <p className="profile-sub">
              <span><UserRound size={14} />{customer?.id ? <Link to={`/customers/${customer.id}`}>{p.customerName}</Link> : p.customerName}</span>
              <span><CalendarDays size={14} />{fmtDate(p.date)}</span>
            </p>
          </div>
        </div>
        <div className="profile-actions">
          <button type="button" className="btn sec sm" onClick={() => nav(-1)}><ArrowLeft size={14} />Back</button>
          <button type="button" className="btn sm" onClick={() => window.print()} title="Use your browser's Save as PDF option to export"><Printer size={14} />Print / PDF</button>
        </div>
      </section>

      {p.status === 'voided' && <div className="lost-banner no-print" role="status"><XCircle size={18} /><div><b>Voided</b><p>{p.voidReason || 'No reason was recorded.'}</p></div></div>}

      <div className="grid stats no-print">
        <StatCard icon={Wallet} tone={p.status === 'completed' ? 'green' : p.status === 'pending' ? 'amber' : 'red'} label="Amount received" value={fmt(p.amount)} sub={labelOf(PAYMENT_METHODS, p.method)} />
        {doc && <StatCard icon={TrendingUp} tone="indigo" label="Document total" value={fmt(doc.total)} sub={`${doc.type} ${doc.number}`} />}
        {doc && <StatCard icon={Wallet} tone="sky" label="Total paid so far" value={fmt(doc.paid)} sub={`${paidPct}% of the total`} />}
        {doc && <StatCard icon={Banknote} tone={doc.balance > 0 ? 'red' : 'green'} label="Remaining balance" value={fmt(doc.balance)} sub={doc.balance > 0 ? 'Still outstanding' : 'Fully paid'} />}
      </div>

      <div className="doc">
        {stamp && <div className={`doc-stamp ${stamp}`} aria-hidden="true">{stamp}</div>}
        <div className="doc-head">
          <div>{business?.logo && <img className="doc-logo" src={business.logo} alt="" />}<b>{business?.name}</b><div className="muted">{business?.address}<br />{business?.phone}</div></div>
          <div className="right"><h2>Payment receipt</h2><b>{p.receiptNo}</b><div><StatusBadge status={p.status} /></div></div>
        </div>
        <div className="doc-cols">
          <div><h4>Received from</h4><b>{customer?.name}</b><div className="muted">{customer?.phone}<br />{customer?.email}</div></div>
          <div className="right"><h4>Payment</h4><div>Date: <b>{fmtDate(p.date)}</b></div><div>Method: <b>{labelOf(PAYMENT_METHODS, p.method)}</b></div><div>Transaction / reference ID: <b>{p.transactionId || '-'}</b></div></div>
        </div>
        <table className="receipt-table"><tbody>
          <tr><td>Payment for</td><td className="right">{doc ? `${doc.type} ${doc.number}` : '-'}</td></tr>
          <tr><td><b>Amount received</b></td><td className="right"><b className="big">{fmt(p.amount)}</b></td></tr>
          {doc && <><tr><td>Document total</td><td className="right">{fmt(doc.total)}</td></tr><tr><td>Total paid so far</td><td className="right">{fmt(doc.paid)}</td></tr><tr><td>Remaining balance</td><td className="right">{fmt(doc.balance)}</td></tr></>}
        </tbody></table>
        {p.notes && <div className="notes"><h4>Notes</h4>{p.notes}</div>}
        {p.status === 'voided' && <div className="notes"><h4>Voided</h4>{p.voidReason}</div>}
        <p className="muted mt">Recorded by {p.recordedByName || '-'}. The transaction ID is a reference entered by staff and is not proof of bank verification.</p>
      </div>
    </div>
  );
}