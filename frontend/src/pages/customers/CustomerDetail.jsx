import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Phone, Mail, MapPin, Building2, CalendarDays, UserCheck, Copy, ChevronRight, Info, StickyNote, Clock, Target, CalendarClock, FileText, Receipt, Wallet, Repeat, TrendingUp, Banknote, Users, ShoppingBag, History } from 'lucide-react';
import { customersApi } from '../../api/customersApi';
import { useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PageLoader, ErrorState, EmptyState } from '../../components/EmptyState.jsx';
import { fmtDate, fmtDateTime, labelOf, SOURCES } from '../../utils/format';
import { whatsAppLink } from '../../utils/whatsapp';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const sum = (rows, pick) => (rows || []).reduce((a, r) => a + (Number(pick(r)) || 0), 0);

const KIND = {
  Lead: { icon: Target, cls: 'tl-indigo' }, 'Follow-up': { icon: CalendarClock, cls: 'tl-sky' }, Quotation: { icon: FileText, cls: 'tl-amber' },
  Invoice: { icon: Receipt, cls: 'tl-violet' }, Payment: { icon: Wallet, cls: 'tl-green' },
};

function Timeline({ items }) {
  return (
    <ul className="tl">
      {items.map((h, i) => {
        const k = KIND[h.kind] || { icon: Clock, cls: 'tl-indigo' };
        const Icon = k.icon;
        return <li key={i}><span className={`tl-ico ${k.cls}`}><Icon size={14} /></span><div><b>{h.kind}</b><p>{h.text}</p><small>{fmtDateTime(h.at)}</small></div></li>;
      })}
    </ul>
  );
}

function Mini({ rows, empty, cols }) {
  if (rows === null) return <p className="muted pad">You do not have permission to view this section.</p>;
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="tw"><table><thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>{cols.map((c) => <td key={c.label}>{c.render(r)}</td>)}</tr>)}</tbody></table></div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can, business, fmt } = useAuth();
  const { data, loading, error, reload } = useAsync(() => customersApi.overview(id), [id]);
  const [tab, setTab] = useState('overview');
  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  const { customer: c } = data;
  const wa = whatsAppLink(c.phone, `Hello ${c.name}, this is ${business?.name}.`, business?.settings?.defaultCountryCode);
  const tabs = [
    ['overview', 'Overview', undefined, Info], ['leads', 'Leads', data.leads, Target], ['followUps', 'Follow-ups', data.followUps, CalendarClock],
    ['quotations', 'Quotations', data.quotations, FileText], ['invoices', 'Invoices', data.invoices, Receipt], ['purchases', 'Purchases', data.purchases, ShoppingBag],
    ['payments', 'Payments', data.payments, Wallet], ['subscriptions', 'Subscriptions', data.subscriptions, Repeat], ['history', 'History', undefined, History],
  ];
  const link = (to, text) => <Link to={to}>{text}</Link>;

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); } catch { toast.error('Could not copy. Please select the text and copy it manually.'); }
  }

  // ---------- summary figures (computed from the data already loaded; sections without permission are null and skipped) ----------
  const billable = (data.invoices || []).filter((r) => !['draft', 'voided', 'cancelled'].includes(r.status));
  const hasMoney = Boolean(data.invoices || data.purchases);
  const billed = sum(billable, (r) => r.total) + sum(data.purchases, (r) => r.total);
  const received = sum((data.payments || []).filter((p) => p.status === 'completed'), (p) => p.amount);
  const outstanding = sum(billable, (r) => r.balance) + sum(data.purchases, (r) => r.balance);
  const openLeads = (data.leads || []).filter((l) => !['converted', 'lost'].includes(l.status)).length;
  const pendingFu = (data.followUps || []).filter((f) => ['scheduled', 'overdue'].includes(f.status));
  const overdueFu = pendingFu.filter((f) => f.status === 'overdue').length;
  const nextFu = [...pendingFu].sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))[0];
  const activeSubs = (data.subscriptions || []).filter((s) => s.status === 'active').length;
  const active = tabs.find((t) => t[0] === tab);

  return (
    <div className="dash cust">
      <div className="crumbs" role="navigation" aria-label="Breadcrumb"><Link to="/customers">Customers</Link><ChevronRight size={13} /><span>{c.name}</span></div>

      <section className="profile">
        <div className="profile-cover" />
        <div className="profile-body">
          <span className={`profile-av av-${hueOf(c.name)}`} aria-hidden="true">{initials(c.name)}</span>
          <div className="profile-info">
            <div className="profile-top">
              <div className="profile-main">
                <div className="profile-title"><h1>{c.name}</h1><StatusBadge status={c.status} /></div>
                <p className="profile-sub">
                  {c.company && <span><Building2 size={14} />{c.company}</span>}
                  <span><CalendarDays size={14} />Customer since {fmtDate(c.createdAt)}</span>
                  <span><UserCheck size={14} />Assigned to {c.assignedName || '-'}</span>
                </p>
              </div>
              <div className="profile-actions no-print">
                {wa && <a className="btn green sm" href={wa} target="_blank" rel="noopener noreferrer" title="Opens WhatsApp. You must press Send there."><MessageCircle size={14} />WhatsApp</a>}
                <a className="btn sec sm" href={`tel:${c.phone}`}><Phone size={14} />Call</a>
                {can('leads', 'create') && <button type="button" className="btn sm" onClick={() => nav('/leads', { state: { prefill: { customer: { id: c.id, name: c.name, phone: c.phone } } } })}>New lead</button>}
                {can('quotations', 'create') && <button type="button" className="btn sm sec" onClick={() => nav(`/quotations/new?customerId=${c.id}`)}>New quotation</button>}
              </div>
            </div>
            <div className="contact-chips">
              <span className="chip"><Phone size={13} /><a href={`tel:${c.phone}`}>{c.phone}</a><button type="button" className="chip-copy" aria-label="Copy phone number" onClick={() => copy(c.phone, 'Phone number')}><Copy size={12} /></button></span>
              {c.email && <span className="chip"><Mail size={13} /><a href={`mailto:${c.email}`}>{c.email}</a><button type="button" className="chip-copy" aria-label="Copy email address" onClick={() => copy(c.email, 'Email')}><Copy size={12} /></button></span>}
              {c.address && <span className="chip"><MapPin size={13} />{c.address}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid stats">
        {hasMoney && <StatCard icon={TrendingUp} tone="indigo" label="Total billed" value={fmt(billed)} sub={`${billable.length} invoice${billable.length === 1 ? '' : 's'} + purchases`} />}
        {data.payments && <StatCard icon={Wallet} tone="green" label="Payments received" value={fmt(received)} sub={`${data.payments.length} payment${data.payments.length === 1 ? '' : 's'}`} />}
        {hasMoney && <StatCard icon={Banknote} tone={outstanding > 0 ? 'red' : 'green'} label="Outstanding balance" value={fmt(outstanding)} sub={outstanding > 0 ? 'Unpaid balance' : 'All settled'} />}
        {data.leads && <StatCard icon={Users} tone="blue" label="Open leads" value={openLeads} sub={`${data.leads.length} lead${data.leads.length === 1 ? '' : 's'} in total`} />}
        {data.followUps && <StatCard icon={CalendarClock} tone={overdueFu ? 'red' : 'sky'} label="Pending follow-ups" value={pendingFu.length} sub={overdueFu ? `${overdueFu} overdue` : 'None overdue'} />}
        {data.subscriptions && <StatCard icon={Repeat} tone="amber" label="Active subscriptions" value={activeSubs} sub={`${data.subscriptions.length} in total`} />}
      </div>

      <div className="tabs" role="tablist">
        {tabs.map(([k, label, rows, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            <Icon size={14} />{label}{Array.isArray(rows) && <span className="tab-count">{rows.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="overview-grid">
          <section className="card info-card">
            <h3 className="card-title"><Info size={16} />Customer details</h3>
            <dl className="info-list">
              <div><dt><Phone size={14} />Phone</dt><dd>{c.phone}</dd></div>
              <div><dt><Mail size={14} />Email</dt><dd>{c.email || '-'}</dd></div>
              <div><dt><MapPin size={14} />Address</dt><dd>{c.address || '-'}</dd></div>
              <div><dt><Building2 size={14} />Company</dt><dd>{c.company || '-'}</dd></div>
              <div><dt><Users size={14} />Assigned agent</dt><dd>{c.assignedName || '-'}</dd></div>
            </dl>
            <div className="note-block"><h4>Business-specific details</h4><p>{c.details || '-'}</p></div>
            <div className="note-block"><h4><StickyNote size={13} />Notes</h4><p>{c.notes || '-'}</p></div>
          </section>

          <div className="side-stack">
            {data.followUps && (
              <section className="card info-card">
                <h3 className="card-title"><CalendarClock size={16} />Next follow-up</h3>
                {nextFu ? (
                  <div className={`next-fu${nextFu.status === 'overdue' ? ' late' : ''}`}>
                    <div className="grow"><b>{fmtDateTime(nextFu.dueAt)}</b><small>{nextFu.notes || 'Follow-up'} &middot; {nextFu.responsibleName}</small></div>
                    <StatusBadge status={nextFu.status} />
                  </div>
                ) : <p className="muted">No pending follow-ups for this customer.</p>}
              </section>
            )}
            <section className="card info-card">
              <h3 className="card-title"><Clock size={16} />Recent activity</h3>
              {data.history.length ? (
                <>
                  <Timeline items={data.history.slice(0, 5)} />
                  {data.history.length > 5 && <button type="button" className="link" onClick={() => setTab('history')}>View full history</button>}
                </>
              ) : <p className="muted">No interaction history yet.</p>}
            </section>
          </div>
        </div>
      )}

      {tab !== 'overview' && (
        <div className="card flush">
          {tab !== 'history' && Array.isArray(active?.[2]) && <div className="tab-head"><h3>{active[1]}</h3><span className="muted">{active[2].length} record{active[2].length === 1 ? '' : 's'}</span></div>}
          {tab === 'leads' && <Mini rows={data.leads} empty="No leads yet" cols={[{ label: 'Source', render: (r) => link(`/leads/${r.id}`, labelOf(SOURCES, r.source)) }, { label: 'Requirements', render: (r) => r.requirements || '-' }, { label: 'Agent', render: (r) => r.assignedName }, { label: 'Date', render: (r) => fmtDate(r.inquiryDate) }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
          {tab === 'followUps' && <Mini rows={data.followUps} empty="No follow-ups" cols={[{ label: 'Due', render: (r) => fmtDateTime(r.dueAt) }, { label: 'Notes', render: (r) => r.notes || '-' }, { label: 'Outcome', render: (r) => r.outcome || '-' }, { label: 'Agent', render: (r) => r.responsibleName }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
          {tab === 'quotations' && <Mini rows={data.quotations} empty="No quotations" cols={[{ label: 'Number', render: (r) => link(`/quotations/${r.id}`, r.number) }, { label: 'Date', render: (r) => fmtDate(r.date) }, { label: 'Total', render: (r) => fmt(r.total) }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
          {tab === 'invoices' && <Mini rows={data.invoices} empty="No invoices" cols={[{ label: 'Number', render: (r) => link(`/invoices/${r.id}`, r.number) }, { label: 'Due', render: (r) => fmtDate(r.dueDate) }, { label: 'Total', render: (r) => fmt(r.total) }, { label: 'Paid', render: (r) => fmt(r.paid) }, { label: 'Balance', render: (r) => fmt(r.balance) }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
          {tab === 'purchases' && <Mini rows={data.purchases} empty="No purchases" cols={[{ label: 'Date', render: (r) => fmtDate(r.date) }, { label: 'Items', render: (r) => r.itemSummary }, { label: 'Total', render: (r) => fmt(r.total) }, { label: 'Balance', render: (r) => fmt(r.balance) }, { label: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus} /> }]} />}
          {tab === 'payments' && <Mini rows={data.payments} empty="No payments" cols={[{ label: 'Receipt', render: (r) => (can('payments', 'view') ? link(`/payments/${r.id}/receipt`, r.receiptNo) : r.receiptNo) }, { label: 'Date', render: (r) => fmtDate(r.date) }, { label: 'For', render: (r) => r.targetNumber }, { label: 'Amount', render: (r) => fmt(r.amount) }, { label: 'Transaction ID', render: (r) => r.transactionId || '-' }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
          {tab === 'subscriptions' && <Mini rows={data.subscriptions} empty="No subscriptions" cols={[{ label: 'Plan', render: (r) => r.planName }, { label: 'Cycle', render: (r) => r.billingCycle }, { label: 'Price', render: (r) => fmt(r.price) }, { label: 'Next billing', render: (r) => fmtDate(r.nextBillingDate) }, { label: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
          {tab === 'history' && (data.history.length ? <div className="panel"><Timeline items={data.history} /></div> : <EmptyState title="No interaction history yet" />)}
        </div>
      )}
    </div>
  );
}