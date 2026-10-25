import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Target, CalendarClock, AlertTriangle, UserCog, FileText, Receipt, Wallet, TrendingUp, Banknote, Repeat, Plus, ArrowRight, MessageSquare, Activity } from 'lucide-react';
import { dashboardApi } from '../../api/reportsApi';
import { useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PageLoader, ErrorState, EmptyState } from '../../components/EmptyState.jsx';
import { LEAD_STATUSES, SOURCES, fmtDateTime, fmtDate, labelOf } from '../../utils/format';

// =====================================================================
// Dependency-free SVG charts (TrendChart, Donut, Gauge) used by the dashboard
// =====================================================================
/* Lightweight, dependency-free SVG charts for the dashboard.
   TrendChart (area / column), Donut (with legend) and Gauge (semicircle). */

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// Measures the container so the SVG is drawn at real pixel size (text stays readable on phones).
function useWidth(fallback = 560) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setW(Math.max(240, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---------- Area / column chart ---------- */
function TrendChart({ data, type = 'area', color = '#4F46E5', format = (v) => String(v) }) {
  const uid = useId().replace(/:/g, '');
  const [ref, W] = useWidth();
  const [hi, setHi] = useState(null);
  const H = 240;
  const pad = { l: 46, r: 14, t: 14, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = data.length;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = iw / Math.max(1, n);
  const step = n > 1 ? iw / (n - 1) : 0;
  const col = type === 'column';
  const px = (i) => (col ? pad.l + slot * i + slot / 2 : pad.l + (n > 1 ? step * i : iw / 2));
  const py = (v) => pad.t + ih - (v / max) * ih;
  const base = pad.t + ih;
  const ticks = [0, 0.5, 1].map((t) => max * t);

  const pts = data.map((d, i) => [px(i), py(d.value)]);
  let line = '';
  pts.forEach(([x, y], i) => {
    if (i === 0) { line = `M${x},${y}`; return; }
    const mx = (pts[i - 1][0] + x) / 2;
    line += ` C${mx},${pts[i - 1][1]} ${mx},${y} ${x},${y}`;
  });
  const area = n ? `${line} L${pts[n - 1][0]},${base} L${pts[0][0]},${base} Z` : '';
  const bw = Math.min(40, slot * 0.55);
  const hw = col ? slot : n > 1 ? step : iw;

  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${col ? 'Column' : 'Area'} chart: ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
        <defs>
          <linearGradient id={`a${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient>
          <linearGradient id={`c${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity=".55" /></linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={py(t)} y2={py(t)} />
            <text className="ax" x={pad.l - 8} y={py(t) + 4} textAnchor="end">{compact.format(t)}</text>
          </g>
        ))}
        {!col && n > 0 && <path d={area} fill={`url(#a${uid})`} />}
        {!col && n > 0 && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {col && data.map((d, i) => (
          <rect key={d.label + i} x={px(i) - bw / 2} y={py(d.value)} width={bw} height={Math.max(0, base - py(d.value))} rx="6" fill={`url(#c${uid})`} opacity={hi === null || hi === i ? 1 : 0.45} />
        ))}
        {!col && data.map((d, i) => <circle key={d.label + i} cx={px(i)} cy={py(d.value)} r={hi === i ? 5 : 3} fill="#fff" stroke={color} strokeWidth="2" />)}
        {data.map((d, i) => <text key={`x${d.label}${i}`} className="ax" x={px(i)} y={H - 9} textAnchor="middle">{d.label}</text>)}
        {data.map((d, i) => (
          <rect key={`h${d.label}${i}`} x={px(i) - hw / 2} y={pad.t} width={hw} height={ih} fill="transparent" tabIndex={0}
            aria-label={`${d.label}: ${format(d.value)}`}
            onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(i)} onBlur={() => setHi(null)} />
        ))}
      </svg>
      {hi !== null && data[hi] && (
        <div className="chart-tip" style={{ left: px(hi), top: py(data[hi].value) }}>
          <span>{data[hi].label}</span><b>{format(data[hi].value)}</b>
        </div>
      )}
    </div>
  );
}

/* ---------- Donut with interactive legend ---------- */
function Donut({ data, centerLabel = 'Total' }) {
  const [active, setActive] = useState(null);
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((a, d) => a + d.value, 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  const gap = items.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = items.map((d, i) => { const len = (d.value / total) * C; const s = { ...d, i, len: Math.max(0, len - gap), off: acc }; acc += len; return s; });
  const cur = active !== null ? items[active] : null;

  return (
    <div className="donut">
      <div className="donut-ring">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${centerLabel}: ${items.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="#F1F5F9" strokeWidth="14" />
          <g transform="rotate(-90 60 60)">
            {segs.map((s) => (
              <circle key={s.label} cx="60" cy="60" r={R} fill="none" stroke={s.color} strokeWidth={active === s.i ? 18 : 14}
                strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={-s.off}
                onMouseEnter={() => setActive(s.i)} onMouseLeave={() => setActive(null)} />
            ))}
          </g>
        </svg>
        <div className="donut-center"><b>{cur ? cur.value : total}</b><span>{cur ? cur.label : centerLabel}</span></div>
      </div>
      <ul className="donut-legend">
        {items.map((d, i) => (
          <li key={d.label} className={active === i ? 'on' : ''} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span className="sw" style={{ background: d.color }} /><span className="lg-name">{d.label}</span><b>{d.value}</b><em>{Math.round((d.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Semicircle gauge (0-100) ---------- */
function Gauge({ value, from = '#4F46E5', to = '#8B5CF6', label, caption, captionTone = 'muted' }) {
  const uid = useId().replace(/:/g, '');
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const arc = 'M 20 90 A 70 70 0 0 1 160 90';
  return (
    <div className="gauge">
      <svg viewBox="0 0 180 104" role="img" aria-label={`${label}: ${Math.round(v)} percent`}>
        <defs><linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={from} /><stop offset="1" stopColor={to} /></linearGradient></defs>
        <path d={arc} fill="none" stroke="#F1F5F9" strokeWidth="16" strokeLinecap="round" />
        {v > 0 && <path className="gauge-fill" d={arc} fill="none" stroke={`url(#g${uid})`} strokeWidth="16" strokeLinecap="round" pathLength="100" strokeDasharray={`${v} 100`} />}
      </svg>
      <div className="gauge-val"><b>{Math.round(v)}%</b><span>{label}</span></div>
      {caption && <span className={`gauge-cap gc-${captionTone}`}>{caption}</span>}
    </div>
  );
}

// ---------- small presentational helpers (UI only, no data logic) ----------
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function initials(name = '') {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function Avatar({ name }) {
  const hue = [...String(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  return <span className={`dash-av av-${hue}`} aria-hidden="true">{initials(name)}</span>;
}

function PanelHead({ icon: Icon, tone = 'indigo', title, sub, to, linkText = 'View', aside }) {
  return (
    <div className="panel-head">
      <div className="panel-title">
        <span className={`panel-ico pi-${tone}`}><Icon size={17} /></span>
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
      </div>
      {aside && <div className="panel-aside">{aside}</div>}
      {to && <Link className="link" to={to}>{linkText} <ArrowRight size={13} /></Link>}
    </div>
  );
}

function Bars({ data, order }) {
  const entries = order.map((o) => [o.label, data?.[o.value] || 0]); const max = Math.max(1, ...entries.map((e) => e[1]));
  return <div className="bars">{entries.map(([k, v]) => <div className="bar-row" key={k}><span>{k}</span><div className="bar-track"><span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></div><b>{v}</b></div>)}</div>;
}

// ---------- chart data helpers ----------
const STATUS_COLORS = {
  draft: '#94A3B8', sent: '#3B82F6', issued: '#3B82F6', accepted: '#10B981', paid: '#10B981', active: '#10B981',
  partially_paid: '#F59E0B', expired: '#F59E0B', paused: '#F59E0B', overdue: '#EF4444', rejected: '#EF4444',
  cancelled: '#CBD5E1', voided: '#CBD5E1',
};
const FALLBACK_COLORS = ['#4F46E5', '#7C3AED', '#14B8A6', '#0EA5E9', '#EC4899', '#F97316'];
const statusLabel = (k) => (k === 'partially_paid' ? 'Partially paid' : String(k).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
const toSlices = (byStatus) => Object.entries(byStatus || {}).map(([k, v], i) => ({ label: statusLabel(k), value: Number(v) || 0, color: STATUS_COLORS[k] || FALLBACK_COLORS[i % FALLBACK_COLORS.length] }));
const monthLabel = (m) => { const [y, mo] = String(m).split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short' }); };
const sumOf = (rows) => rows.reduce((a, r) => a + r.value, 0);

function ChartEmpty({ icon, title }) { return <EmptyState title={title} icon={icon} />; }

export default function Dashboard() {
  const { user, can, isAdmin, fmt } = useAuth();
  const { data: d, loading, error, reload } = useAsync(() => dashboardApi.get(), []);
  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;

  const firstName = String(user?.name || '').trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  // Chart data. Trend charts need the optional `trends` field from the API (see DashboardController patch); they hide themselves without it.
  const revenueSeries = (d.trends || []).map((t) => ({ label: monthLabel(t.month), value: Number(t.revenue) || 0 }));
  const leadSeries = (d.trends || []).map((t) => ({ label: monthLabel(t.month), value: Number(t.leads) || 0 }));
  const hasTrends = Boolean(d.trends?.length);
  const salesTotal = d.sales?.total || 0;
  const collectionRate = salesTotal > 0 ? Math.min(100, ((d.payments?.received || 0) / salesTotal) * 100) : 0;
  const collectionCaption = !salesTotal ? 'No sales yet' : collectionRate >= 80 ? 'Healthy collection' : collectionRate >= 50 ? 'Fair collection' : 'Needs attention';
  const collectionTone = !salesTotal ? 'muted' : collectionRate >= 80 ? 'ok' : collectionRate >= 50 ? 'warn' : 'err';
  const leadTotal = d.leads?.total || 0;
  const conversionRate = leadTotal > 0 ? ((d.leads?.byStatus?.converted || 0) / leadTotal) * 100 : 0;
  const invoiceSlices = toSlices(d.invoices?.byStatus);
  const quoteSlices = toSlices(d.quotations?.byStatus);
  const subSlices = d.subscriptions ? [{ label: 'Active', value: d.subscriptions.active || 0, color: '#10B981' }, { label: 'Paused', value: d.subscriptions.paused || 0, color: '#F59E0B' }] : [];
  const gaugeCls = `card panel${hasTrends ? '' : ' s3'}`;
  const subtitle = isAdmin ? 'Business-wide overview' : d.scope === 'all' ? 'Your work and permitted records' : 'Your assigned customers and work';

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-hero-text">
          <span className="dash-eyebrow">{isAdmin ? 'Admin dashboard' : 'My dashboard'} &middot; {today}</span>
          <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{subtitle}</p>
          <div className="hero-pills">
            {d.followUps && <span className="hero-pill"><CalendarClock size={14} /><b>{d.followUps.today}</b> follow-ups today</span>}
            {d.followUps && d.followUps.overdue > 0 && <span className="hero-pill alert"><AlertTriangle size={14} /><b>{d.followUps.overdue}</b> overdue</span>}
            {d.leads && <span className="hero-pill"><Target size={14} /><b>{d.leads.newCount}</b> new {isAdmin ? 'inquiries' : 'leads'}</span>}
          </div>
        </div>
        <div className="hero-actions no-print">
          {can('leads', 'create') && <Link className="hero-btn solid" to="/leads"><Plus size={16} />Add lead</Link>}
          {can('followUps', 'create') && <Link className="hero-btn ghost" to="/follow-ups"><CalendarClock size={16} />Schedule follow-up</Link>}
        </div>
      </section>

      <div className="grid stats">
        {d.customers && <StatCard icon={Users} label={isAdmin ? 'Total customers' : 'My customers'} value={d.customers.total} sub={`${d.customers.active} active`} to="/customers" />}
        {d.leads && <StatCard icon={Target} tone="indigo" label={isAdmin ? 'New inquiries' : 'My new leads'} value={d.leads.newCount} sub={`${d.leads.open} open leads`} to="/leads" />}
        {d.followUps && <StatCard icon={CalendarClock} tone="sky" label="Follow-ups due today" value={d.followUps.today} sub={`${d.followUps.upcoming} scheduled`} to="/follow-ups" />}
        {d.followUps && <StatCard icon={AlertTriangle} tone={d.followUps.overdue ? 'red' : 'green'} label="Overdue reminders" value={d.followUps.overdue} sub={d.followUps.overdue ? 'Needs attention' : 'All on time'} to="/follow-ups" />}
        {isAdmin && <StatCard icon={UserCog} tone="navy" label="Active Agents" value={d.activeAgents} to="/agents" />}
        {d.quotations && <StatCard icon={FileText} tone="amber" label="Quotations" value={d.quotations.total} sub={`Open value ${fmt(d.quotations.openValue)}`} to="/quotations" />}
        {d.invoices && <StatCard icon={Receipt} tone="indigo" label="Invoices" value={d.invoices.total} sub={`${d.invoices.byStatus?.overdue || 0} overdue`} to="/invoices" />}
        {d.sales && <StatCard icon={TrendingUp} tone="green" label="Sales" value={fmt(d.sales.total)} sub="Issued invoices + purchases" />}
        {d.payments && <StatCard icon={Wallet} tone="green" label="Payments received" value={fmt(d.payments.received)} sub={d.payments.pending ? `${fmt(d.payments.pending)} pending` : `${d.payments.count} payments`} to="/payments" />}
        {d.sales && <StatCard icon={Banknote} tone="red" label="Outstanding balances" value={fmt(d.sales.outstanding)} sub={d.invoices ? `${fmt(d.invoices.overdue)} overdue` : undefined} />}
        {d.subscriptions && <StatCard icon={Repeat} tone="sky" label="Subscriptions" value={d.subscriptions.active} sub={`${d.subscriptions.renewingSoon} renewing soon`} to="/subscriptions" />}
      </div>

      <div className="dash-grid">
        {hasTrends && d.payments && (
          <div className="card panel s4">
            <PanelHead icon={TrendingUp} tone="green" title="Revenue collected" sub="Completed payments, last 6 months" aside={<span className="panel-total">{fmt(sumOf(revenueSeries))}</span>} to={can('payments', 'view') ? '/payments' : undefined} />
            {sumOf(revenueSeries) === 0 ? <ChartEmpty icon={Wallet} title="No payments in the last 6 months" /> : <TrendChart data={revenueSeries} type="area" color="#4F46E5" format={fmt} />}
          </div>
        )}
        {d.payments && d.sales && (
          <div className={gaugeCls}>
            <PanelHead icon={Wallet} tone="indigo" title="Collection rate" sub="Payments received vs total sales" />
            <Gauge value={collectionRate} label="of sales collected" caption={collectionCaption} captionTone={collectionTone} from="#4F46E5" to="#14B8A6" />
          </div>
        )}
        {hasTrends && d.leads && (
          <div className="card panel s4">
            <PanelHead icon={Target} tone="blue" title="New leads per month" sub="By inquiry date, last 6 months" aside={<span className="panel-total">{sumOf(leadSeries)}</span>} to="/leads" />
            {sumOf(leadSeries) === 0 ? <ChartEmpty icon={Target} title="No inquiries in the last 6 months" /> : <TrendChart data={leadSeries} type="column" color="#2563EB" />}
          </div>
        )}
        {d.leads && (
          <div className={gaugeCls}>
            <PanelHead icon={Target} tone="violet" title="Lead conversion" sub="Converted leads vs all leads" />
            <Gauge value={conversionRate} label="converted" caption={leadTotal ? `${d.leads.byStatus?.converted || 0} of ${leadTotal} leads` : 'No leads yet'} from="#7C3AED" to="#EC4899" />
          </div>
        )}
        {d.invoices && (
          <div className="card panel">
            <PanelHead icon={Receipt} tone="indigo" title="Invoices by status" to="/invoices" />
            {sumOf(invoiceSlices) === 0 ? <ChartEmpty icon={Receipt} title="No invoices yet" /> : <Donut data={invoiceSlices} centerLabel="Invoices" />}
          </div>
        )}
        {d.quotations && (
          <div className="card panel">
            <PanelHead icon={FileText} tone="amber" title="Quotations by status" to="/quotations" />
            {sumOf(quoteSlices) === 0 ? <ChartEmpty icon={FileText} title="No quotations yet" /> : <Donut data={quoteSlices} centerLabel="Quotations" />}
          </div>
        )}
        {d.subscriptions && (
          <div className="card panel">
            <PanelHead icon={Repeat} tone="sky" title="Subscriptions" to="/subscriptions" />
            {sumOf(subSlices) === 0 ? <ChartEmpty icon={Repeat} title="No subscriptions yet" /> : <Donut data={subSlices} centerLabel="Subscriptions" />}
          </div>
        )}
        {d.leads && (
          <div className="card panel">
            <PanelHead icon={Target} tone="indigo" title="Leads by status" sub={isAdmin ? 'All leads' : 'Your leads'} to="/leads" />
            <Bars data={d.leads.byStatus} order={LEAD_STATUSES} />
          </div>
        )}
        {d.followUps && (
          <div className="card panel s4">
            <PanelHead icon={CalendarClock} tone="sky" title="Today's follow-ups and overdue reminders" sub="In-app reminders" to="/follow-ups" linkText="Open" />
            {!d.todayList?.length ? <EmptyState title="All caught up" text="No follow-ups are due today." icon={CalendarClock} /> : (
              <ul className="low-list">
                {d.todayList.map((f) => (
                  <li key={f.id}><Avatar name={f.customerName} /><div className="grow"><b>{f.customerName}</b><small>{f.notes || 'Follow-up'} &middot; {fmtDateTime(f.dueAt)}{isAdmin ? ` · ${f.responsibleName}` : ''}</small></div><StatusBadge status={f.status} label={f.status === 'overdue' ? 'Overdue' : 'Today'} /></li>
                ))}
              </ul>
            )}
          </div>
        )}
        {d.recentLeads && (
          <div className="card panel s3">
            <PanelHead icon={MessageSquare} tone="blue" title="Recent inquiries" to="/leads" />
            {!d.recentLeads.length ? <EmptyState title="No inquiries yet" icon={MessageSquare} /> : (
              <ul className="low-list">{d.recentLeads.map((l) => <li key={l.id}><Avatar name={l.customerName} /><div className="grow"><b><Link className="plain-link" to={`/leads/${l.id}`}>{l.customerName}</Link></b><small>{labelOf(SOURCES, l.source)} &middot; {fmtDate(l.inquiryDate)}</small></div><StatusBadge status={l.status} /></li>)}</ul>
            )}
          </div>
        )}
        {d.renewals && (
          <div className="card panel s3">
            <PanelHead icon={Repeat} tone="amber" title="Subscription renewals" sub="Next 14 days" to="/subscriptions" linkText="Open" />
            {!d.renewals.length ? <EmptyState title="No renewals due" icon={Repeat} /> : (
              <ul className="low-list">{d.renewals.map((s) => <li key={s.id}><Avatar name={s.customerName} /><div className="grow"><b>{s.customerName}</b><small>{s.planName} &middot; {fmtDate(s.nextBillingDate)}</small></div><span className="badge b-warn">{s.daysToRenewal < 0 ? `${-s.daysToRenewal}d overdue` : s.daysToRenewal === 0 ? 'Today' : `in ${s.daysToRenewal}d`}</span></li>)}</ul>
            )}
          </div>
        )}
        <div className="card panel s3">
          <PanelHead icon={Activity} tone="violet" title="Recent activity" sub={isAdmin ? 'Everyone in your business' : 'Your actions'} />
          {!d.recentActivity.length ? <EmptyState title="No activity yet" /> : (
            <ul className="low-list">{d.recentActivity.map((a) => <li key={a.id}><Avatar name={a.userName} /><div className="grow"><b>{a.text}</b><small>{a.userName} &middot; {fmtDateTime(a.at)}</small></div></li>)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}