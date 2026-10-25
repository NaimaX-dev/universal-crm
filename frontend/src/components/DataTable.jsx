import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from './EmptyState.jsx';

// Page numbers to show: everything when there are few pages, otherwise 1 ... current-1 current current+1 ... last.
function pageWindow(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push(`gap-${n}`); out.push(n); });
  return out;
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <div className="pager"><span className="muted">{total} record{total === 1 ? '' : 's'}</span></div> : null;
  return (
    <div className="pager">
      <span className="muted">Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}</span>
      <div className="pager-btns">
        <button type="button" className="pg" disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page"><ChevronsLeft size={15} /></button>
        <button type="button" className="pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
        {pageWindow(page, pages).map((n) => (typeof n === 'string'
          ? <span key={n} className="pg-gap" aria-hidden="true">...</span>
          : <button type="button" key={n} className={`pg${n === page ? ' on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>))}
        <button type="button" className="pg" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
        <button type="button" className="pg" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="Last page"><ChevronsRight size={15} /></button>
      </div>
    </div>
  );
}

// columns: [{ key, label, sortable, render(row), className }]
export default function DataTable({ columns, rows, loading, error, onRetry, sort, onSort, page, pageSize, total, onPage, emptyTitle, emptyText, emptyAction, rowKey = 'id' }) {
  if (loading && !rows.length) return <Skeleton rows={6} cols={columns.length} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows.length) return <EmptyState title={emptyTitle || 'No records found'} text={emptyText || 'Try changing the search or filters.'} action={emptyAction} />;
  return (
    <>
      <div className={`tw${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const sorted = sort?.key === c.key;
                const canSort = c.sortable && onSort;
                return (
                  /* The whole header cell is clickable; the inner button gives keyboard users the same action (its click bubbles up to the cell). */
                  <th key={c.key} className={`${c.sortable ? 'sortable' : ''}${sorted ? ' sorted' : ''}${c.className ? ` ${c.className}` : ''}`} onClick={canSort ? () => onSort(c.key) : undefined} aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {canSort
                      ? <button type="button" className="th-sort" title={`Sort by ${c.label}`}>{c.label}{sorted ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} className="idle" />}</button>
                      : <span>{c.label}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <tr key={r[rowKey]}>{columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : (r[c.key] ?? '-')}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {onPage && <Pagination page={page} pageSize={pageSize} total={total} onPage={onPage} />}
    </>
  );
}