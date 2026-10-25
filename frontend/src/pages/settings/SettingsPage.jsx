import { useState } from 'react';
import { Loader2, Info, Mail, Building2, SlidersHorizontal, UserRound, Upload } from 'lucide-react';
import { Field, EntityForm, validateFields } from '../../components/Field.jsx';
import { businessApi } from '../../api/businessApi';
import { authApi } from '../../api/authApi';
import { remindersApi } from '../../api/remindersApi';
import { useAsync } from '../../hooks/useData';
import StatusBadge from '../../components/StatusBadge.jsx';
import { PageLoader, ErrorState } from '../../components/EmptyState.jsx';
import { fmtDateTime } from '../../utils/format';
import { fillTemplate } from '../../utils/whatsapp';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { config } from '../../config';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function SectionHead({ icon: Icon, title, text }) {
  return <div className="set-head"><span className="panel-ico pi-indigo"><Icon size={18} /></span><div><h3>{title}</h3><p>{text}</p></div></div>;
}
// Password strength hint for the "new password" field: ['Weak' | 'Fair' | 'Strong', css class] or null when empty.
function strengthOf(p) {
  if (!p) return null;
  let s = 0;
  if (p.length >= 8) s += 1;
  if (p.length >= 12) s += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  return s <= 2 ? ['Weak', 'weak'] : s <= 3 ? ['Fair', 'fair'] : ['Strong', 'strong'];
}

function useSave(fn, okMsg) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const [errors, setErrors] = useState({}); const [formError, setFormError] = useState('');
  const run = async (...a) => {
    if (busy) return; setBusy(true); setErrors({}); setFormError('');
    try { await fn(...a); toast.success(okMsg); } catch (e) { setErrors(e.errors || {}); setFormError(e.errors ? 'Please correct the highlighted fields.' : e.message); } finally { setBusy(false); }
  };
  return { busy, errors, formError, run, setErrors };
}

function BusinessTab() {
  const { business, setBusiness, isAdmin } = useAuth();
  const [v, setV] = useState({ name: business.name, type: business.type, email: business.email, phone: business.phone, address: business.address, logo: business.logo || '' });
  const [local, setLocal] = useState({});
  const s = useSave(async () => { const b = await businessApi.update({ ...v, settings: business.settings }); setBusiness(b); }, 'Business profile saved.');
  const fields = [
    { name: 'name', label: 'Business name', required: true, disabled: !isAdmin }, { name: 'type', label: 'Business type', placeholder: 'e.g. Clinic, Travel agency', disabled: !isAdmin },
    { name: 'email', label: 'Business email', type: 'email', disabled: !isAdmin }, { name: 'phone', label: 'Phone', disabled: !isAdmin }, { name: 'address', label: 'Address', full: true, disabled: !isAdmin },
  ];
  const onLogo = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!f.type.startsWith('image/')) { setLocal({ logo: 'Choose an image file.' }); return; }
    if (f.size > 250 * 1024) { setLocal({ logo: 'Logo must be smaller than 250 KB.' }); return; }
    const r = new FileReader(); r.onload = () => { setV((x) => ({ ...x, logo: r.result })); setLocal({}); }; r.readAsDataURL(f);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); const errs = validateFields(fields, v); setLocal(errs); if (!Object.keys(errs).length) s.run(); }} noValidate>
      <SectionHead icon={Building2} title="Business profile" text="These details appear on your quotations, invoices and receipts." />
      {!isAdmin && <div className="banner"><Info size={15} />Only a Business Admin can change the business profile.</div>}
      {s.formError && <div className="form-error">{s.formError}</div>}
      <EntityForm fields={fields} values={v} errors={{ ...local, ...s.errors }} onChange={(k, val) => setV((x) => ({ ...x, [k]: val }))} />
      <div className="mt">
        <Field label="Logo" error={local.logo || s.errors.logo} help="PNG, JPG, GIF or WEBP under 250 KB. It is stored in the database.">
          <div className="logo-row">
            {v.logo ? <img className="logo-prev" src={v.logo} alt="Logo preview" /> : <span className="logo-empty" aria-hidden="true"><Building2 size={22} /></span>}
            <div className="logo-actions">
              <label className={`btn sec sm upload-btn${isAdmin ? '' : ' off'}`}><Upload size={14} />Choose image<input className="vh" type="file" accept="image/*" onChange={onLogo} disabled={!isAdmin} /></label>
              {v.logo && isAdmin && <button type="button" className="link" onClick={() => setV((x) => ({ ...x, logo: '' }))}>Remove logo</button>}
            </div>
          </div>
        </Field>
      </div>
      {isAdmin && <div className="modal-foot"><button type="submit" className="btn" disabled={s.busy}>{s.busy && <Loader2 size={15} className="spin-i" />}Save profile</button></div>}
    </form>
  );
}

const TOGGLES = [
  ['email', 'Email notifications', 'Send reminder emails from the server (needs SMTP, see the Email reminders tab).'],
  ['sms', 'SMS notifications', 'Optional. Not integrated yet, this is only a saved preference.'],
  ['whatsapp', 'WhatsApp message buttons', 'Show buttons that open WhatsApp with a prepared message. You press Send yourself.'],
];

function PreferencesTab() {
  const { business, setBusiness, isAdmin } = useAuth();
  const st = business.settings;
  const [v, setV] = useState({ currency: st.currency, taxRate: st.taxRate, quotationValidityDays: st.quotationValidityDays, invoiceDueDays: st.invoiceDueDays, defaultCountryCode: st.defaultCountryCode || '', email: st.notifications?.email !== false, sms: Boolean(st.notifications?.sms), whatsapp: st.notifications?.whatsapp !== false, whatsappTemplate: st.whatsappTemplate || '' });
  const [local, setLocal] = useState({});
  const d = !isAdmin;
  const moneyFields = [
    { name: 'currency', label: 'Currency symbol', required: true, disabled: d }, { name: 'taxRate', label: 'Default tax rate (%)', type: 'number', min: 0, max: 100, step: 'any', disabled: d },
    { name: 'quotationValidityDays', label: 'Quotation validity (days)', type: 'number', min: 1, disabled: d }, { name: 'invoiceDueDays', label: 'Invoice payment terms (days)', type: 'number', min: 0, disabled: d },
  ];
  const chatFields = [
    { name: 'defaultCountryCode', label: 'Default country code (for WhatsApp links)', placeholder: 'e.g. 92', help: 'Used to turn numbers starting with 0 into international numbers.', disabled: d },
  ];
  const fields = [...moneyFields, ...chatFields];
  const s = useSave(async () => {
    const b = await businessApi.update({ name: business.name, type: business.type, email: business.email, phone: business.phone, address: business.address, logo: business.logo, settings: { currency: v.currency, taxRate: Number(v.taxRate), quotationValidityDays: Number(v.quotationValidityDays), invoiceDueDays: Number(v.invoiceDueDays), defaultCountryCode: v.defaultCountryCode, whatsappTemplate: v.whatsappTemplate, notifications: { email: v.email, sms: v.sms, whatsapp: v.whatsapp } } });
    setBusiness(b);
  }, 'Preferences saved.');
  const onChange = (k, val) => setV((x) => ({ ...x, [k]: val }));
  const errs = { ...local, ...s.errors };
  const preview = fillTemplate(v.whatsappTemplate, { name: 'Ahsan', business: business.name, message: 'This is a reminder about our follow-up.' });
  return (
    <form onSubmit={(e) => { e.preventDefault(); const er = validateFields(fields, v); setLocal(er); if (!Object.keys(er).length) s.run(); }} noValidate>
      <SectionHead icon={SlidersHorizontal} title="Preferences and notifications" text="Defaults for new documents, and how reminders and WhatsApp buttons behave." />
      {!isAdmin && <div className="banner"><Info size={15} />Only a Business Admin can change business settings.</div>}
      {s.formError && <div className="form-error">{s.formError}</div>}
      <h4 className="form-section">Documents and currency</h4>
      <EntityForm fields={moneyFields} values={v} errors={errs} onChange={onChange} />
      <h4 className="form-section">WhatsApp</h4>
      <EntityForm fields={chatFields} values={v} errors={errs} onChange={onChange} />
      <h4 className="form-section">Notification preferences</h4>
      <div className="toggle-list">
        <div className="toggle-row"><div><b>In-app reminders</b><small>Always on.</small></div><label className="switch"><input type="checkbox" checked disabled aria-label="In-app reminders" /><span className="track" /></label></div>
        {TOGGLES.map(([k, title, desc]) => (
          <div className="toggle-row" key={k}><div><b>{title}</b><small>{desc}</small></div><label className="switch"><input type="checkbox" checked={Boolean(v[k])} disabled={d} aria-label={title} onChange={(e) => onChange(k, e.target.checked)} /><span className="track" /></label></div>
        ))}
      </div>
      <div className="warn-box"><b>What these switches do:</b> in-app reminders work now. <b>Email</b> reminders are sent from the server only if SMTP is configured (see the Email reminders tab). <b>SMS</b> is optional and not integrated: the switch is only a saved preference. <b>WhatsApp</b> buttons open a WhatsApp chat ({config.whatsappBase}) with a prepared message: you must press Send yourself, nothing is sent automatically.</div>
      <div className="mt">
        <Field label="WhatsApp message template" htmlFor="wa-t" help="Placeholders: {name} customer name, {business} business name, {message} context text."><textarea id="wa-t" value={v.whatsappTemplate} disabled={d} onChange={(e) => onChange('whatsappTemplate', e.target.value)} /></Field>
        {!d && <div className="quick-chips" aria-label="Insert placeholder">{['{name}', '{business}', '{message}'].map((p) => <button key={p} type="button" className="qchip" onClick={() => onChange('whatsappTemplate', `${v.whatsappTemplate}${p}`)}>{p}</button>)}</div>}
        <div className="wa-preview"><span>Preview (sample customer)</span><p>{preview || <i>The template is empty, so WhatsApp will open without prepared text.</i>}</p></div>
      </div>
      {isAdmin && <div className="modal-foot"><button type="submit" className="btn" disabled={s.busy}>{s.busy && <Loader2 size={15} className="spin-i" />}Save preferences</button></div>}
    </form>
  );
}

function EmailTab() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => remindersApi.status(), [], isAdmin);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  if (!isAdmin) return <div className="banner"><Info size={15} />Only a Business Admin can manage email reminders.</div>;
  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  async function send() {
    setBusy(true); setResult(null);
    try { const r = await remindersApi.send(); setResult(r); if (r.sent > 0) toast.success(`${r.sent} reminder email(s) accepted by the mail server.`); reload(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <SectionHead icon={Mail} title="Email reminders" text="Reminders go to the Agent responsible for each follow-up that is due or overdue." />
      <p className="muted mb">They are sent <b>only</b> when the server's email settings are valid, and an email is counted as sent <b>only</b> if the mail server accepted it.</p>
      <div className="sub-sum">
        <div className="sub-tile"><span>Server email status</span><b>{data.configured ? <span className="badge b-ok"><span className="dot" />Configured (SMTP)</span> : <span className="badge b-warn"><span className="dot" />Not configured</span>}</b></div>
        <div className="sub-tile"><span>Sender address</span><b className="wrap">{data.from || '-'}</b></div>
        <div className="sub-tile"><span>Email notifications</span><b>{data.businessEmailEnabled ? 'On' : 'Off'}</b>{!data.businessEmailEnabled && <small>Change in Preferences</small>}</div>
      </div>
      {!data.configured && <div className="warn-box mb">Email is not configured on the server, so no emails can be sent. Set <code>MAIL_DRIVER=smtp</code> and the <code>MAIL_*</code> values in <code>backend/.env</code> (see README), then restart the PHP server.</div>}
      <div className="row-gap mb">
        <button type="button" className="btn" disabled={busy} onClick={send}>{busy ? <Loader2 size={15} className="spin-i" /> : <Mail size={15} />}Send due reminders now</button>
        <span className="muted">To send them automatically, schedule <code>php backend/bin/send_reminders.php</code> (see README).</span>
      </div>
      {result && <div className={result.sent > 0 && !result.failed ? 'result-ok' : 'warn-box'}><b>Result:</b> {result.message} (due: {result.total}, accepted by mail server: {result.sent}, failed: {result.failed}, not sent: {result.skipped})</div>}
      <h4 className="form-section">Recent email attempts</h4>
      {!data.recent.length ? <p className="muted">No email attempts yet.</p> : (
        <div className="tw short"><table><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Result</th></tr></thead>
          <tbody>{data.recent.map((e) => <tr key={e.id}><td>{fmtDateTime(e.createdAt)}</td><td>{e.toEmail}</td><td>{e.subject}</td><td><StatusBadge status={e.status === 'sent' ? 'completed' : e.status === 'failed' ? 'failed' : 'pending'} label={e.status} />{e.error && <small>{e.error}</small>}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function AccountTab() {
  const { user, setUser } = useAuth();
  const [v, setV] = useState({ name: user.name, phone: user.phone || '', currentPassword: '', newPassword: '' });
  const [local, setLocal] = useState({});
  const s = useSave(async () => { const r = await authApi.updateProfile(v); setUser(r.user); setV((x) => ({ ...x, currentPassword: '', newPassword: '' })); }, 'Account updated.');
  const fields = [
    { name: 'name', label: 'Full name', required: true }, { name: 'phone', label: 'Phone' },
    { name: 'currentPassword', label: 'Current password', type: 'password', help: 'Only needed to change your password.', validate: (val, all) => (all.newPassword && !val ? 'Enter your current password.' : '') },
    { name: 'newPassword', label: 'New password', type: 'password', minLength: 8 },
  ];
  const strength = strengthOf(v.newPassword);
  return (
    <form onSubmit={(e) => { e.preventDefault(); const errs = validateFields(fields, v); if (v.newPassword && !v.currentPassword) errs.currentPassword = 'Enter your current password.'; setLocal(errs); if (!Object.keys(errs).length) s.run(); }} noValidate>
      <SectionHead icon={UserRound} title="My account" text="Your own name, phone and password." />
      {s.formError && <div className="form-error">{s.formError}</div>}
      <p className="muted mb">Signed in as <b>{user.email}</b> ({user.role}). Your email and permissions are managed by your Business Admin.</p>
      <EntityForm fields={fields} values={v} errors={{ ...local, ...s.errors }} onChange={(k, val) => setV((x) => ({ ...x, [k]: val }))} />
      {strength && <div className={`strength ${strength[1]}`} role="status"><i /><span>New password strength: <b>{strength[0]}</b></span></div>}
      <div className="modal-foot"><button type="submit" className="btn" disabled={s.busy}>{s.busy && <Loader2 size={15} className="spin-i" />}Save account</button></div>
    </form>
  );
}

const TABS = [['business', 'Business profile', Building2], ['prefs', 'Preferences and notifications', SlidersHorizontal], ['email', 'Email reminders', Mail], ['account', 'My account', UserRound]];

export default function SettingsPage() {
  const [tab, setTab] = useState('business');
  const { business, user } = useAuth();
  return (
    <div className="dash">
      <section className="card settings-hero">
        {business?.logo ? <img className="set-logo" src={business.logo} alt="" /> : <span className={`cell-av lg av-${hueOf(business?.name)}`} aria-hidden="true">{initials(business?.name)}</span>}
        <div><h1>Settings</h1><p>Business profile, preferences and your own account</p></div>
        <div className="set-user"><span className={`cell-av sm av-${hueOf(user?.name)}`} aria-hidden="true">{initials(user?.name)}</span><div><b>{user?.name}</b><small>{user?.email}{user?.role && ` - ${user.role}`}</small></div></div>
      </section>
      <div className="settings">
        <div className="settings-nav" role="tablist" aria-orientation="vertical">
          {TABS.map(([k, label, Icon]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`snav${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}><Icon size={16} /><span>{label}</span></button>)}
        </div>
        <div className="card settings-card" role="tabpanel">
          {tab === 'business' && <BusinessTab />}{tab === 'prefs' && <PreferencesTab />}{tab === 'email' && <EmailTab />}{tab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  );
}