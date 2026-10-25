import { useState } from 'react';
import { Activity, Loader2, Eye, EyeOff, Users, UserCheck, Clock, Sparkles } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import { Field } from '../../components/Field.jsx';
import { EmptyState, Skeleton } from '../../components/EmptyState.jsx';
import { usersApi } from '../../api/usersApi';
import { useAsync } from '../../hooks/useData';
import { useToast } from '../../context/ToastContext.jsx';
import { MODULES, ACTION_LABELS, ALL_ACTIONS, defaultAgentPermissions, emptyPermissions } from '../../utils/permissions';
import { fmtDateTime } from '../../utils/format';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function Avatar({ name }) {
  return <span className={`cell-av av-${hueOf(name)}`} aria-hidden="true">{initials(name)}</span>;
}
const MAX_CHIPS = 4;

// Random 12-character password (letters + digits, no look-alike characters).
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// One-click permission sets for the matrix (the admin can still tick individual boxes afterwards).
const allOf = (on) => Object.fromEntries(MODULES.map((m) => [m.key, Object.fromEntries(m.actions.map((a) => [a, on]))]));
const PRESETS = [
  ['none', 'No access', () => emptyPermissions()],
  ['view', 'View only', () => Object.fromEntries(MODULES.map((m) => [m.key, { view: true }]))],
  ['standard', 'Standard agent', () => defaultAgentPermissions()],
  ['all', 'All permissions', () => allOf(true)],
];

function PermissionMatrix({ value, onChange }) {
  const toggle = (m, a) => onChange({ ...value, [m]: { ...(value[m] || {}), [a]: !value[m]?.[a] } });
  const setRow = (m, on) => { const o = {}; MODULES.find((x) => x.key === m).actions.forEach((a) => { o[a] = on; }); onChange({ ...value, [m]: o }); };
  const viewCount = MODULES.filter((m) => value[m.key]?.view).length;
  return (
    <div className="perm-box">
      <div className="perm-bar">
        <span className="perm-sum"><b>{viewCount}</b> of {MODULES.length} modules visible</span>
        <div className="quick-chips" aria-label="Permission presets">
          {PRESETS.map(([k, label, make]) => <button key={k} type="button" className="qchip" onClick={() => onChange(make())}>{label}</button>)}
        </div>
      </div>
      <div className="tw perm-wrap">
        <table className="perm-table">
          <thead><tr><th>Module</th>{ALL_ACTIONS.map((a) => <th key={a} title={ACTION_LABELS[a]}>{a === 'delete' ? 'Delete' : ACTION_LABELS[a]}</th>)}<th>All</th></tr></thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m.key}>
                <td title={m.manageHint || ''}>{m.label}{m.manageHint && <small>{m.manageHint}</small>}</td>
                {ALL_ACTIONS.map((a) => <td key={a}>{m.actions.includes(a) ? <input type="checkbox" aria-label={`${m.label} ${a}`} checked={Boolean(value[m.key]?.[a])} onChange={() => toggle(m.key, a)} /> : <span className="muted">-</span>}</td>)}
                <td><input type="checkbox" aria-label={`${m.label} all`} checked={m.actions.every((a) => value[m.key]?.[a])} onChange={(e) => setRow(m.key, e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SCOPES = [
  ['assigned', 'Assigned records only', 'Sees only the customers, leads and records assigned to them.', UserCheck],
  ['all', 'All records in this business', 'Sees every customer, lead and record in the business.', Users],
];

function AgentForm({ mode, initial, saving, errors, formError, onSubmit, onCancel, submitLabel }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', email: '', phone: '', password: '', scope: 'assigned', ...initial, permissions: initial.permissions || defaultAgentPermissions() });
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const [local, setLocal] = useState({});
  const [showPw, setShowPw] = useState(false);
  const submit = (e) => {
    e.preventDefault(); if (saving) return;
    const errs = {};
    if (!v.name.trim()) errs.name = 'Name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.email = 'Enter a valid email address.';
    if (mode === 'create' && v.password.length < 8) errs.password = 'Use at least 8 characters.';
    if (mode === 'edit' && v.password && v.password.length < 8) errs.password = 'Use at least 8 characters.';
    setLocal(errs); if (Object.keys(errs).length) return;
    onSubmit(v);
  };
  async function generate() {
    const pw = generatePassword();
    set('password', pw); setShowPw(true); setLocal((l) => ({ ...l, password: undefined }));
    try { await navigator.clipboard.writeText(pw); toast.success('Password generated and copied. Share it with the Agent securely.'); } catch { toast.success('Password generated. Copy it now and share it securely.'); }
  }
  const err = { ...local, ...errors };
  return (
    <form onSubmit={submit} noValidate>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <h4 className="form-section">Account details</h4>
      <div className="form-grid">
        <Field label="Full name" required htmlFor="a-name" error={err.name}><input id="a-name" value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Email (login)" required htmlFor="a-email" error={err.email}><input id="a-email" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone" htmlFor="a-phone"><input id="a-phone" value={v.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label={mode === 'create' ? 'Password' : 'New password (optional)'} required={mode === 'create'} htmlFor="a-pw" error={err.password} help="At least 8 characters. Share it with the Agent securely.">
          <div className="pw-wrap">
            <input id="a-pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={v.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="icon-btn" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((s) => !s)}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          <button type="button" className="link gen-btn" onClick={generate}><Sparkles size={13} />Generate a strong password</button>
        </Field>
      </div>

      <h4 className="form-section">Access</h4>
      <div className="form-grid">
        <Field label="Customer / record access" full error={err.scope} help="Controls which customers, leads and related records this Agent can see. The PHP API enforces it.">
          <div className="opt-list" role="radiogroup" aria-label="Customer and record access">
            {SCOPES.map(([val, title, desc, Icon]) => (
              <label key={val} className={`opt${v.scope === val ? ' on' : ''}`}>
                <input type="radio" name="a-scope" value={val} checked={v.scope === val} onChange={() => set('scope', val)} />
                <span className="opt-ico"><Icon size={16} /></span>
                <span><b>{title}</b><small>{desc}</small></span>
              </label>
            ))}
          </div>
        </Field>
        <div className="field full"><label>Permissions</label><PermissionMatrix value={v.permissions} onChange={(p) => set('permissions', p)} /></div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn sec" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn" disabled={saving}>{saving && <Loader2 size={15} className="spin-i" />}{submitLabel}</button>
      </div>
    </form>
  );
}

function ActivityModal({ agent, onClose }) {
  const { data, loading, error } = useAsync(() => usersApi.activity(agent.id), [agent.id]);
  return (
    <Modal title={`Activity: ${agent.name}`} onClose={onClose}>
      {loading ? <Skeleton rows={4} /> : error ? <p className="form-error">{error}</p> : !data.length ? <EmptyState title="No activity yet" text="Actions this Agent performs will be listed here." /> : (
        <ul className="tl">{data.map((a) => <li key={a.id}><span className="tl-ico tl-indigo"><Clock size={14} /></span><div><p>{a.text}</p><small>{fmtDateTime(a.at)}</small></div></li>)}</ul>
      )}
    </Modal>
  );
}

export default function AgentsPage() {
  const [activity, setActivity] = useState(null);
  return (
    <>
      <ResourceList
        title="Agents" subtitle="Create Agent accounts and control exactly what each Agent can access" entity="agent" api={usersApi} perm={{ create: true, edit: true, delete: true }}
        searchPlaceholder="Search agents by name or email..." wideForm FormComponent={AgentForm}
        /* Status is now a segmented tab bar (All / Active / Inactive) instead of a dropdown; it sends the same `status` parameter. */
        tabs={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} tabParam="status"
        filters={[]}
        deactivate={{ from: 'active', to: 'inactive', message: 'This Agent will no longer be able to sign in. Their records are kept.' }}
        toForm={(r) => ({ name: r.name, email: r.email, phone: r.phone, scope: r.scope, permissions: r.permissions, password: '' })}
        initialValues={{ permissions: defaultAgentPermissions() }}
        columns={[
          { key: 'name', label: 'Agent', render: (r) => <div className="cell-person"><Avatar name={r.name} /><div><span className="cell-name">{r.name}</span><small>{r.email}</small></div></div> },
          { key: 'scope', label: 'Record access', render: (r) => (r.scope === 'all' ? <span className="ent tl-indigo"><Users size={13} />All records</span> : <span className="ent tl-grey"><UserCheck size={13} />Assigned only</span>) },
          {
            key: 'perms', label: 'Modules allowed',
            render: (r) => {
              const names = MODULES.filter((m) => r.permissions?.[m.key]?.view).map((m) => m.label);
              if (!names.length) return <span className="muted">None</span>;
              return (
                <div className="inc-list" title={names.join(', ')}>
                  {names.slice(0, MAX_CHIPS).map((n) => <span key={n} className="src-chip">{n}</span>)}
                  {names.length > MAX_CHIPS && <span className="inc-more">+{names.length - MAX_CHIPS} more</span>}
                </div>
              );
            },
          },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rowActions={(r) => <button type="button" className="icon-btn" title="View activity" aria-label="View activity" onClick={() => setActivity(r)}><Activity size={16} /></button>}
      />
      {activity && <ActivityModal agent={activity} onClose={() => setActivity(null)} />}
    </>
  );
}