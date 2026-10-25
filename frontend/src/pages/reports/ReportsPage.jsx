import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Download, Printer, Search, ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, Users, Target, UserCog, CalendarClock, FileText, Receipt, Wallet, Banknote, Repeat, TrendingUp, BarChart3, AlertCircle } from 'lucide-react';
import PageHeader from '../../components/PageHeader.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PageLoader, ErrorState, EmptyState } from '../../components/EmptyState.jsx';
import { reportsApi } from '../../api/reportsApi';
import { useAsync } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { addDays, today, fmtDate, fmtDateTime, labelOf, SOURCES } from '../../utils/format';
import { downloadCsv } from '../../utils/csv';

const TYPES = [
  { key: 'customers', label: 'Customers', module: 'customers', icon: Users }, { key: 'leads', label: 'Leads', module: 'leads', icon: Target },
  { key: 'agents', label: 'Agent performance', admin: true, icon: UserCog }, { key: 'followups', label: 'Follow-ups', module: 'followUps', icon: CalendarClock },
  { key: 'quotations', label: 'Quotations', module: 'quotations', icon: FileText }, { key: 'invoices', label: 'Invoices', module: 'invoices', icon: Receipt },
  { key: 'payments', label: 'Payments', module: 'payments', icon: Wallet }, { key: 'outstanding', label: 'Outstanding', module: 'invoices', icon: AlertCircle },
  { key: 'subscriptions', label: 'Subscriptions', module: 'subscriptions', icon: Repeat }, { key: 'sales', label: 'Sales', module: 'invoices', icon: TrendingUp },
];

// ---------- small presentational helpers (UI only, no data logic) ----------
const ALL_TIME = '2000-01-01';
const RANGES = [
  ['30', 'Last 30 days', () => [addDays(today(), -30), '']],
  ['90', 'Last 90 days', () => [addDays(today(), -90), '']],
  ['year', 'This year', () => [`${today().slice(0, 4)}-01-01`, '']],
  ['365', 'Last 12 months', () => [addDays(today(), -365), '']],
  ['all', 'All time', () => [ALL_TIME, '']],
];
// Picks an icon + colour for a summary figure from its label (cosmetic only).
function metaFor(label = '') {
  const s = label.toLowerCase();
  if (/outstanding|overdue|unpaid|balance|due\b/.test(s)) return [Banknote, 'red'];
  if (/paid|received|payment|collected|revenue|sales|income/.test(s)) return [Wallet, 'green'];
  if (/customer|agent|user/.test(s)) return [Users, 'blue'];
  if (/lead|convert|inquir/.test(s)) return [Target, 'indigo'];
  if (/follow/.test(s)) return [CalendarClock, 'sky'];
  if (/quot|invoice|document/.test(s)) return [FileText, 'amber'];
  if (/subscr|renew/.test(s)) return [Repeat, 'sky'];
  return [BarChart3, 'navy'];
}

export default function ReportsPage() {
  const { can, isAdmin, fmt } = useAuth();
  const allowed = TYPES.filter((t) => (t.admin ? isAdmin : can(t.module, 'view')));
  const [type, setType] = useState(allowed[0]?.key);
  const [from, setFrom] = useState(addDays(today(), -365)); const [to, setTo] = useState('');
  const { data, loading, error, reload } = useAsync(() => reportsApi.get(type, { from, to }), [type, from, to], Boolean(type));
  const [q, setQ] = useState(''); const [sort, setSort] = useState(null); const [page, setPage] = useState(0); const [size, setSize] = useState(25); const [printing, setPrinting] = useState(false);

  // While the browser prints, show every row instead of only the current page.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  if (!allowed.length) return <div className="card"><EmptyState title="No reports available" text="Ask your Admin for access to a module to see its report." /></div>;

  const cell = (c, r) => {
    const v = r[c.key];
    if (c.type === 'money') return fmt(v); if (c.type === 'date') return fmtDate(v); if (c.type === 'datetime') return fmtDateTime(v);
    if (c.type === 'status') return <StatusBadge status={v} />;
    if (c.key === 'source') return labelOf(SOURCES, v);
    return v === '' || v === undefined || v === null ? '-' : v;
  };
  const pickType = (k) => { setType(k); setQ(''); setSort(null); setPage(0); };
  const toggleSort = (key) => { setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null)); setPage(0); };

  // Search, sort and paging all happen in the browser on the rows the API already returned.
  const rows = data?.rows || []; const columns = data?.columns || [];
  const needle = q.trim().toLowerCase();
  const filtered = needle ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(needle) || (c.key === 'source' && String(labelOf(SOURCES, r[c.key])).toLowerCase().includes(needle)))) : rows;
  const sortCol = sort && columns.find((c) => c.key === sort.key);
  const numeric = ['money', 'number'].includes(sortCol?.type);
  const sorted = sort ? [...filtered].sort((a, b) => {
    const x = a[sort.key]; const y = b[sort.key];
    const nx = x === null || x === undefined || x === ''; const ny = y === null || y === undefined || y === '';
    if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1; // empty values always last
    const d = numeric ? Number(x) - Number(y) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return sort.dir === 'asc' ? d : -d;
  }) : filtered;
  const perPage = printing ? Math.max(1, sorted.length) : size;
  const pages = Math.max(1, Math.ceil(sorted.length / perPage)); const cur = Math.min(page, pages - 1);
  const pageRows = sorted.slice(cur * perPage, cur * perPage + perPage);
  const exportCsv = () => downloadCsv(`${type}-report-${today()}.csv`, columns, sorted); // exports what the search and sort currently show (all pages)
  const setRange = (make) => { const [f, t] = make(); setFrom(f); setTo(t); };
  const activeRange = RANGES.find(([, , make]) => { const [f, t] = make(); return f === from && t === to; })?.[0];
  const hasMoney = columns.some((c) => c.type === 'money');

  return (
    <div className="dash">
      <PageHeader title="Reports" subtitle="Figures are limited to the records your account is allowed to see" icon={BarChart3} tone="blue">
        <button type="button" className="btn sec sm" onClick={() => window.print()}><Printer size={14} />Print / PDF</button>
        <button type="button" className="btn sm" disabled={!sorted.length} onClick={exportCsv}><Download size={14} />Export CSV</button>
      </PageHeader>
      <div className="tabs" role="tablist">{allowed.map((t) => { const Icon = t.icon; return <button key={t.key} type="button" role="tab" aria-selected={type === t.key} className={`tab${type === t.key ? ' on' : ''}`} onClick={() => pickType(t.key)}><Icon size={14} />{t.label}</button>; })}</div>
      <div className="toolbar range-bar">
        <div className="quick-chips" aria-label="Date range presets">
          {RANGES.map(([k, label, make]) => <button key={k} type="button" className={`qchip${activeRange === k ? ' on' : ''}`} aria-pressed={activeRange === k} onClick={() => setRange(make)}>{label}</button>)}
        </div>
        <label className="row-gap muted">From <input className="date-in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /></label>
        <label className="row-gap muted">To <input className="date-in" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></label>
        <button type="button" className="btn sec sm" onClick={() => { setFrom(addDays(today(), -365)); setTo(''); }}>Reset dates</button>
      </div>
      {loading ? <PageLoader /> : error ? <div className="card"><ErrorState message={error} onRetry={reload} /></div> : (
        <>
          <div className="grid stats">
            {data.summary.map((s) => { const [Icon, tone] = metaFor(s.label); return <StatCard key={s.label} icon={Icon} tone={tone} label={s.label} value={s.type === 'money' ? fmt(s.value) : s.value} />; })}
          </div>
          {data.breakdowns && (
            <div className="dash-grid">{data.breakdowns.map((b) => { const max = Math.max(1, ...b.items.map((i) => i.value)); return (
              <div className="card panel s3" key={b.title}>
                <div className="panel-head"><div className="panel-title"><span className="panel-ico pi-indigo"><BarChart3 size={17} /></span><div><h3>{b.title}</h3></div></div></div>
                {!b.items.length ? <p className="muted">No data in this period.</p> : <div className="bars">{b.items.map((i) => <div className="bar-row" key={i.label}><span className="cap">{String(labelOf(SOURCES, i.label)).replace(/_/g, ' ')}</span><div className="bar-track"><span className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></div><b>{i.value}</b></div>)}</div>}
              </div>); })}</div>
          )}
          <div className="card flush">
            <div className="panel-head panel">
              <div><h3>{data.title}</h3><p>{filtered.length === rows.length ? `${rows.length} row(s)` : `${filtered.length} of ${rows.length} row(s)`}</p></div>
              {rows.length > 0 && <label className="tbl-search no-print"><Search size={15} /><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search this report..." aria-label="Search rows" /></label>}
            </div>
            {!rows.length ? <EmptyState title="No data for this period" text="Try a wider date range." /> : !sorted.length ? <EmptyState title="No matching rows" text="Try a different search." /> : (
              <>
                <div className="tw"><table className="rep-table"><thead><tr>{columns.map((c) => {
                  const right = ['money', 'number'].includes(c.type); const on = sort?.key === c.key;
                  return (
                    <th key={c.key} className={right ? 'right' : ''} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className={`th-sort${on ? ' on' : ''}`} onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}>{c.label}{on ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ChevronsUpDown size={13} />}</button>
                    </th>
                  );
                })}</tr></thead>
                  <tbody>{pageRows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c.key} className={['money', 'number'].includes(c.type) ? 'right' : ''}>{cell(c, r)}</td>)}</tr>)}</tbody>
                  {hasMoney && (
                    <tfoot><tr className="total-row">{columns.map((c, i) => <td key={c.key} className={['money', 'number'].includes(c.type) ? 'right' : ''}>{i === 0 ? (needle ? 'Total (matching rows)' : 'Total') : c.type === 'money' ? fmt(sorted.reduce((acc, r) => acc + (Number(r[c.key]) || 0), 0)) : ''}</td>)}</tr></tfoot>
                  )}</table></div>
                {sorted.length > 10 && (
                  <div className="rep-pager no-print">
                    <span>Showing {cur * perPage + 1}-{Math.min(sorted.length, (cur + 1) * perPage)} of {sorted.length}</span>
                    <div className="rep-pager-ctl">
                      <label>Rows <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} aria-label="Rows per page">{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                      <button type="button" className="icon-btn" aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft size={16} /></button>
                      <span>Page {cur + 1} of {pages}</span>
                      <button type="button" className="icon-btn" aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}