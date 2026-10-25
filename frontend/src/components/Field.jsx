import { useEffect, useId, useRef, useState } from 'react';
import { Search, X, UserPlus, Phone, Mail, MapPin, Building2, UserRound, UserCheck, CalendarDays, CalendarClock, Banknote, Percent, Clock, Lock, Tag } from 'lucide-react';
import { customersApi } from '../api/customersApi';
import { useDebounce } from '../hooks/useData';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- client-side validation (usability only; the API validates again) ----------
export function validateFields(fields, values) {
  const errors = {};
  fields.forEach((f) => {
    if (f.hidden && f.hidden(values)) return;
    const v = values[f.name];
    if (f.type === 'customer') {
      if (f.required && !(v && (v.id || v.newCustomer))) errors[f.name] = 'Please select or create a customer.';
      if (v?.newCustomer) {
        if (!v.newCustomer.name?.trim()) errors[f.name] = 'Enter the new customer\'s name.';
        else if (!v.newCustomer.phone?.trim()) errors[f.name] = 'Enter the new customer\'s phone.';
        else if (v.newCustomer.email && !EMAIL_RE.test(v.newCustomer.email)) errors[f.name] = 'The new customer\'s email is not valid.';
      }
      return;
    }
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (f.required && empty && f.type !== 'switch') { errors[f.name] = `${f.label} is required.`; return; }
    if (empty) {
      // A custom rule can depend on other fields ("required only when X is filled"), so it also runs for empty values.
      if (f.validate) { const m = f.validate(v, values); if (m) errors[f.name] = m; }
      return;
    }
    if (f.type === 'email' && !EMAIL_RE.test(String(v))) errors[f.name] = 'Enter a valid email address.';
    if (f.type === 'number') {
      if (Number.isNaN(Number(v))) errors[f.name] = 'Enter a number.';
      else if (f.min !== undefined && Number(v) < f.min) errors[f.name] = `Must be ${f.min} or more.`;
      else if (f.max !== undefined && Number(v) > f.max) errors[f.name] = `Must be ${f.max} or less.`;
    }
    if (f.minLength && String(v).length < f.minLength) errors[f.name] = `Use at least ${f.minLength} characters.`;
    if (f.validate) { const m = f.validate(v, values); if (m) errors[f.name] = m; }
  });
  return errors;
}

// When htmlFor is given, the label, help text and error get ids (`<htmlFor>-label`, `-help`, `-err`) that EntityForm links to the input for screen readers.
export function Field({ label, htmlFor, required, error, help, full, children, className = '' }) {
  return (
    <div className={`field${full ? ' full' : ''}${error ? ' has-err' : ''}${className ? ` ${className}` : ''}`}>
      {label && <label htmlFor={htmlFor} id={htmlFor ? `${htmlFor}-label` : undefined}>{label}{required && <em aria-hidden="true">*</em>}</label>}
      {children}
      {help && !error && <span className="help" id={htmlFor ? `${htmlFor}-help` : undefined}>{help}</span>}
      {error && <span className="err-msg" role="alert" id={htmlFor ? `${htmlFor}-err` : undefined}>{error}</span>}
    </div>
  );
}


// Picks a small icon for the inside of an input from the field's type / name / label (cosmetic only).
// A field can override it: icon: SomeLucideIcon, or icon: false for none. Textareas, multi-selects, switches and the customer picker never get one.
function iconFor(f) {
  if (f.icon === false) return null;
  if (f.icon) return f.icon;
  if (!['select', 'text', 'email', 'tel', 'number', 'date', 'datetime-local', 'password', undefined].includes(f.type)) return null;
  const n = `${f.name} ${f.label || ''}`.toLowerCase();
  if (f.type === 'tel' || /phone|mobile|whatsapp/.test(n)) return Phone;
  if (f.type === 'email' || /e-?mail/.test(n)) return Mail;
  if (f.type === 'password') return Lock;
  if (f.type === 'date') return CalendarDays;
  if (f.type === 'datetime-local') return CalendarClock;
  if (/address|location|city/.test(n)) return MapPin;
  if (/company|organi[sz]ation/.test(n)) return Building2;
  if (/assigned|responsible|agent/.test(n)) return UserCheck;
  if (f.type === 'number' && /price|amount|cost|fee/.test(n)) return Banknote;
  if (/rate|percent|tax|discount/.test(n)) return Percent;
  if (/duration|validity|days/.test(n)) return Clock;
  if (f.name === 'name') return /customer|full|person|agent/.test(n) ? UserRound : Tag;
  if (f.type === 'select' && /category|type|source|priority|cycle|status|method/.test(n)) return Tag;
  return null;
}

export function EntityForm({ fields, values, errors = {}, onChange }) {
  return (
    <div className="form-grid">
      {fields.filter((f) => !(f.hidden && f.hidden(values))).map((f) => {
        const id = `f-${f.name}`; const v = values[f.name]; const err = errors[f.name];
        const options = typeof f.options === 'function' ? f.options(values) : f.options;
        const set = (val) => onChange(f.name, val);
        // Accessibility links between the control, its help text and its error.
        const a11y = { 'aria-invalid': err ? 'true' : undefined, 'aria-required': f.required ? 'true' : undefined, 'aria-describedby': err ? `${id}-err` : f.help ? `${id}-help` : undefined };
        if (f.type === 'switch') {
          return <div key={f.name} className={`field${f.full ? ' full' : ''}`}><label className="switch"><input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} /><span className="track" />{f.label}</label></div>;
        }
        let input;
        if (f.type === 'textarea') input = <textarea id={id} value={v ?? ''} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} disabled={f.disabled} {...a11y} />;
        else if (f.type === 'select') {
          input = (
            <select id={id} value={v ?? ''} onChange={(e) => set(e.target.value)} disabled={f.disabled} {...a11y}>
              <option value="">{f.placeholder || 'Select...'}</option>
              {(options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          );
        } else if (f.type === 'multiselect') {
          const sel = v || [];
          input = (
            <div className="checks" id={id} role="group" aria-labelledby={`${id}-label`} {...a11y}>
              {(options || []).length === 0 && <span className="muted">Nothing to choose from yet.</span>}
              {(options || []).map((o) => (
                <label key={o.value}><input type="checkbox" checked={sel.includes(o.value)} onChange={(e) => set(e.target.checked ? [...sel, o.value] : sel.filter((x) => x !== o.value))} />{o.label}</label>
              ))}
            </div>
          );
        } else if (f.type === 'customer') {
          input = <CustomerPicker value={v} onChange={set} allowNew={f.allowNew} disabled={f.disabled} />;
        } else {
          input = <input id={id} type={f.type || 'text'} value={v ?? ''} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} min={f.min} max={f.max} step={f.step} disabled={f.disabled} autoComplete={f.type === 'password' ? 'new-password' : 'off'} {...a11y} />;
        }
        const Icon = iconFor(f);
        if (Icon && (f.type === 'select' || !['textarea', 'multiselect', 'customer'].includes(f.type))) input = <div className="input-ico"><Icon size={16} className="ii" aria-hidden="true" />{input}</div>;
        return <Field key={f.name} label={f.label} htmlFor={id} required={f.required} error={err} help={f.help} full={f.full || f.type === 'textarea' || f.type === 'multiselect' || f.type === 'customer'}>{input}</Field>;
      })}
    </div>
  );
}

// ---------- small presentational helpers for the picker (UI only) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;

// Search an existing customer, or (allowNew) type a new one. A duplicate warning avoids double records.
// Keyboard: Arrow Up/Down move through the results, Enter picks, Escape closes the list (without closing a dialog around it).
export function CustomerPicker({ value, onChange, allowNew = false, disabled = false }) {
  const listId = `picker-${useId().replace(/:/g, '')}`;
  const box = useRef(null);
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [dup, setDup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!open || value?.id || value?.newCustomer) return undefined;
    let live = true;
    setLoading(true);
    customersApi.list({ search: dq, pageSize: 8, status: 'active', sort: 'name' })
      .then((r) => { if (live) { setResults(r.rows); setMsg(''); setActive(-1); } })
      .catch((e) => { if (live) { setResults([]); setMsg(e.message); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [dq, open, value]);

  // Close the list when the user clicks anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const nc = value?.newCustomer;
  const checkDup = async (next) => {
    if (!next.phone && !next.email) return;
    try { const r = await customersApi.checkDuplicate({ phone: next.phone, email: next.email }); setDup(r.customer); } catch { setDup(null); }
  };
  const setNew = (k, val) => onChange({ newCustomer: { ...nc, [k]: val } });

  if (value?.id) {
    return (
      <div className="picked">
        <span className={`cell-av sm av-${hueOf(value.name)}`} aria-hidden="true">{initials(value.name)}</span>
        <div className="picked-main"><b>{value.name}</b>{value.phone && <small className="muted">{value.phone}</small>}</div>
        {!disabled && <button type="button" className="icon-btn" aria-label="Change customer" onClick={() => { onChange(null); setQ(''); }}><X size={16} /></button>}
      </div>
    );
  }
  if (nc) {
    return (
      <div className="sub-box">
        <div className="sub-head">
          <b>New customer</b>
          <button type="button" className="link" onClick={() => { onChange(null); setDup(null); }}>Choose existing instead</button>
        </div>
        <div className="form-grid">
          <Field label="Name" required htmlFor="nc-name"><input id="nc-name" value={nc.name || ''} onChange={(e) => setNew('name', e.target.value)} /></Field>
          <Field label="Phone" required htmlFor="nc-phone"><input id="nc-phone" value={nc.phone || ''} onChange={(e) => setNew('phone', e.target.value)} onBlur={() => checkDup(nc)} /></Field>
          <Field label="Email" htmlFor="nc-email"><input id="nc-email" type="email" value={nc.email || ''} onChange={(e) => setNew('email', e.target.value)} onBlur={() => checkDup(nc)} /></Field>
          <Field label="Address" htmlFor="nc-address"><input id="nc-address" value={nc.address || ''} onChange={(e) => setNew('address', e.target.value)} /></Field>
        </div>
        {dup && (
          <div className="warn-box">A customer with this phone/email already exists: <b>{dup.name}</b> ({dup.phone}).{' '}
            <button type="button" className="link" onClick={() => { onChange({ id: dup.id, name: dup.name, phone: dup.phone }); setDup(null); }}>Use existing customer</button></div>
        )}
      </div>
    );
  }

  // The pickable rows: every result, plus the "create new customer" action when allowed.
  const rows = [...results.map((c) => ({ kind: 'customer', c })), ...(allowNew ? [{ kind: 'new' }] : [])];
  const choose = (row) => {
    if (row.kind === 'new') onChange({ newCustomer: { name: q, phone: '', email: '', address: '' } });
    else onChange({ id: row.c.id, name: row.c.name, phone: row.c.phone });
    setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (!rows.length) return;
      setActive((a) => (e.key === 'ArrowDown' ? Math.min(rows.length - 1, a + 1) : Math.max(0, a - 1)));
    } else if (e.key === 'Enter' && open && active >= 0 && rows[active]) {
      e.preventDefault(); choose(rows[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); setOpen(false);
    }
  };
  return (
    <div className="picker" ref={box}>
      <div className="search">
        <Search size={15} />
        <input
          value={q} placeholder="Search customer by name, phone or email..." disabled={disabled} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <div className="picker-list" id={listId} role="listbox">
          {msg && <div className="picker-note">{msg}</div>}
          {!msg && loading && !results.length && <div className="picker-note">Searching...</div>}
          {!msg && !loading && !results.length && <div className="picker-note">No matching customers.</div>}
          {rows.map((row, i) => (row.kind === 'customer' ? (
            <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === active} key={row.c.id} className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => choose(row)}>
              <span className={`cell-av sm av-${hueOf(row.c.name)}`} aria-hidden="true">{initials(row.c.name)}</span>
              <span className="pi-text">{row.c.name}<small>{row.c.phone}{row.c.email ? ` - ${row.c.email}` : ''}</small></span>
            </button>
          ) : (
            <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === active} key="new" className={`opt-new${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(row)}>
              <UserPlus size={15} /><span className="pi-text">Create new customer{q ? ` "${q}"` : ''}</span>
            </button>
          )))}
        </div>
      )}
    </div>
  );
}