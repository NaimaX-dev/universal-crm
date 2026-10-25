import { useEffect, useState } from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const newKey = () => Math.random().toString(36).slice(2);
export const blankItem = () => ({ key: newKey(), type: 'custom', refId: '', description: '', qty: 1, unitPrice: 0, discount: 0 });

// Client-side ESTIMATE only. The server recalculates and its figures are the ones that are saved.
export function estimate(items, taxRate) {
  let gross = 0; let disc = 0;
  items.forEach((i) => { const g = (Number(i.qty) || 0) * (Number(i.unitPrice) || 0); gross += g; disc += g * ((Number(i.discount) || 0) / 100); });
  const net = gross - disc; const tax = net * ((Number(taxRate) || 0) / 100);
  return { subtotal: gross, discount: disc, tax, total: net + tax };
}

// catalog: [{ type:'service'|'package', id, name, price }]
export default function LineItemsEditor({ items, onChange, catalog = [], taxRate, onTaxRate, showTax = true, error }) {
  const { fmt } = useAuth();
  const [focusKey, setFocusKey] = useState(null);
  const set = (idx, patch) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const pick = (idx, value) => {
    if (!value) { set(idx, { type: 'custom', refId: '' }); return; }
    const [type, id] = value.split(':'); const c = catalog.find((x) => x.type === type && x.id === id);
    if (c) set(idx, { type, refId: id, description: c.name, unitPrice: c.price });
  };
  const t = estimate(items, taxRate);

  // After "Add line" / "Duplicate", move the cursor into the new row's description.
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector(`tr[data-key="${focusKey}"] input[aria-label="Description"]`)?.focus();
    setFocusKey(null);
  }, [focusKey, items]);
  const addLine = () => { const it = blankItem(); onChange([...items, it]); setFocusKey(it.key); };
  const duplicate = (i) => { const copy = { ...items[i], key: newKey() }; onChange([...items.slice(0, i + 1), copy, ...items.slice(i + 1)]); setFocusKey(copy.key); };

  return (
    <div>
      <div className="tw open">
        <table className="items">
          <thead><tr><th className="col-cat">Catalog item</th><th>Description</th><th className="col-qty">Qty</th><th className="col-price">Unit price</th><th className="col-disc">Disc. %</th><th className="right col-total">Line total</th><th className="col-act" /></tr></thead>
          <tbody>
            {items.map((it, i) => {
              const line = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0) * (1 - (Number(it.discount) || 0) / 100);
              return (
                <tr key={it.key || i} data-key={it.key}>
                  <td data-label="Catalog item">
                    <select aria-label="Catalog item" value={it.refId ? `${it.type}:${it.refId}` : ''} onChange={(e) => pick(i, e.target.value)}>
                      <option value="">Custom item</option>
                      {catalog.map((c) => <option key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>{c.type === 'package' ? 'Package' : 'Service'}: {c.name}</option>)}
                    </select>
                  </td>
                  <td data-label="Description"><input aria-label="Description" value={it.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                  <td data-label="Qty"><input aria-label="Quantity" type="number" min="0" step="any" value={it.qty} onChange={(e) => set(i, { qty: e.target.value })} /></td>
                  <td data-label="Unit price"><input aria-label="Unit price" type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></td>
                  <td data-label="Disc. %"><input aria-label="Discount percent" type="number" min="0" max="100" step="any" value={it.discount} onChange={(e) => set(i, { discount: e.target.value })} /></td>
                  <td className="right line-total" data-label="Line total">{fmt(line)}</td>
                  <td className="act">
                    <button type="button" className="icon-btn" aria-label="Duplicate line" title="Duplicate line" onClick={() => duplicate(i)}><Copy size={15} /></button>
                    <button type="button" className="icon-btn danger" aria-label="Remove line" title="Remove line" disabled={items.length === 1} onClick={() => onChange(items.filter((_, x) => x !== i))}><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <span className="err-msg" role="alert">{error}</span>}
      <div className="items-foot">
        <button type="button" className="btn sec sm" onClick={addLine}><Plus size={14} />Add line</button>
        <div className="totals">
          <div><span>Subtotal</span><span>{fmt(t.subtotal)}</span></div>
          <div><span>Discounts</span><span>-{fmt(t.discount)}</span></div>
          {showTax && <div><span>Tax (%) <input className="tax-in" type="number" min="0" max="100" step="any" value={taxRate} onChange={(e) => onTaxRate(e.target.value)} aria-label="Tax percent" /></span><span>{fmt(t.tax)}</span></div>}
          <div className="grand"><span>Estimated total</span><span>{fmt(t.total)}</span></div>
          <small className="muted">Estimate only. The server recalculates the final total when you save.</small>
        </div>
      </div>
    </div>
  );
}