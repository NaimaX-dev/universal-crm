import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { MessageCircle, CheckCircle2, XCircle, CalendarPlus, RefreshCw, Loader2, ChevronRight, Phone, Copy, Check, Inbox, CalendarDays, UserCheck, UserRound, Clock, CalendarClock, Plus, Flag, Info, History, StickyNote, FileText, ShoppingBag } from 'lucide-react';
import { leadsApi } from '../../api/leadsApi';
import { followUpsApi } from '../../api/followUpsApi';
import { useAsync, useList } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { Field } from '../../components/Field.jsx';
import { PageLoader, ErrorState, EmptyState } from '../../components/EmptyState.jsx';
import { SOURCES, LEAD_STATUSES, PRIORITIES, labelOf, fmtDate, fmtDateTime, today } from '../../utils/format';
import { whatsAppLink, fillTemplate } from '../../utils/whatsapp';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const isClosed = (status) => ['converted', 'lost'].includes(status);
const ageDays = (iso) => {
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date(); n.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((n - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5));
};
// Picks an icon for a history line from its wording (purely cosmetic).
const histIcon = (text = '') => {
  const s = text.toLowerCase();
  if (/convert/.test(s)) return { icon: CheckCircle2, cls: 'tl-green' };
  if (/lost|closed/.test(s)) return { icon: XCircle, cls: 'tl-red' };
  if (/follow/.test(s)) return { icon: CalendarClock, cls: 'tl-sky' };
  if (/status/.test(s)) return { icon: RefreshCw, cls: 'tl-violet' };
  if (/creat|added|new/.test(s)) return { icon: Plus, cls: 'tl-indigo' };
  return { icon: Clock, cls: 'tl-indigo' };
};

function StatusModal({ lead, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState(lead.status); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState({});
  async function save(e) {
    e.preventDefault(); if (busy) return;
    if (status === 'lost' && !note.trim()) { setErr({ note: 'Please record why the lead is closed / lost.' }); return; }
    setBusy(true);
    try { await leadsApi.setStatus(lead.id, status, status === 'lost' ? { reason: note } : { note }); toast.success('Lead status updated.'); onDone(); }
    catch (ex) { setErr(ex.errors?.reason ? { note: ex.errors.reason } : { form: ex.message }); } finally { setBusy(false); }
  }
  return (
    <Modal title="Change lead status" onClose={onClose}>
      <form onSubmit={save} noValidate>
        {err.form && <div className="form-error">{err.form}</div>}
        <div className="form-grid">
          <Field label="New status" htmlFor="ls-status" full><select id="ls-status" value={status} onChange={(e) => setStatus(e.target.value)}>{LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <Field label={status === 'lost' ? 'Reason for closing' : 'Note (optional)'} required={status === 'lost'} htmlFor="ls-note" full error={err.note}><textarea id="ls-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="modal-foot"><button type="button" className="btn sec" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy || status === lead.status}>{busy && <Loader2 size={15} className="spin-i" />}Update status</button></div>
      </form>
    </Modal>
  );
}

function ConvertModal({ lead, onClose, onDone }) {
  const { can } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const [next, setNext] = useState('none'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function convert() {
    setBusy(true);
    try {
      await leadsApi.setStatus(lead.id, 'converted', { note: 'Lead converted' }); toast.success('Lead marked as converted.');
      if (next === 'quotation') nav(`/quotations/new?customerId=${lead.customerId}&leadId=${lead.id}`);
      else if (next === 'purchase') nav('/purchases', { state: { prefill: { customer: { id: lead.customerId, name: lead.customerName }, leadId: lead.id } } });
      else onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const options = [
    ['none', 'Only mark as converted', 'No further action.', true, CheckCircle2],
    ['quotation', 'Create a quotation for this customer', 'Opens a new quotation linked to this lead.', can('quotations', 'create'), FileText],
    ['purchase', 'Record a purchase (sale) for this customer', 'Opens Purchases with this customer filled in.', can('purchases', 'create'), ShoppingBag],
  ];
  return (
    <Modal title="Convert lead" onClose={onClose}>
      <p className="muted mb">The customer record already exists, so no duplicate customer is created. Choose what to do next:</p>
      {err && <div className="form-error">{err}</div>}
      <div className="opt-list">
        {options.map(([v, title, desc, ok, Icon]) => (
          <label key={v} className={`opt${next === v ? ' on' : ''}${ok ? '' : ' off'}`}>
            <input type="radio" name="next" disabled={!ok} checked={next === v} onChange={() => setNext(v)} />
            <span className="opt-ico"><Icon size={16} /></span>
            <span><b>{title}{!ok && ' (no permission)'}</b><small>{desc}</small></span>
          </label>
        ))}
      </div>
      <div className="modal-foot"><button type="button" className="btn sec" onClick={onClose}>Cancel</button><button type="button" className="btn green" disabled={busy} onClick={convert}>{busy && <Loader2 size={15} className="spin-i" />}Convert</button></div>
    </Modal>
  );
}

function FollowUpModal({ lead, onClose, onDone }) {
  const toast = useToast(); const { user } = useAuth();
  const [dueAt, setDueAt] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState({});
  async function save(e) {
    e.preventDefault(); if (busy) return;
    if (!dueAt) { setErr({ dueAt: 'Choose a date and time.' }); return; }
    setBusy(true);
    try { await followUpsApi.create({ customerId: lead.customerId, leadId: lead.id, dueAt, notes, responsibleId: lead.assignedTo === user.id ? user.id : lead.assignedTo }); toast.success('Follow-up scheduled.'); onDone(); }
    catch (ex) { setErr(ex.errors || { form: ex.message }); } finally { setBusy(false); }
  }
  return (
    <Modal title="Schedule follow-up" onClose={onClose}>
      <form onSubmit={save} noValidate>
        {err.form && <div className="form-error">{err.form}</div>}
        <div className="form-grid">
          <Field label="Date and time" required htmlFor="fu-due" error={err.dueAt} full><input id="fu-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
          <Field label="Notes" htmlFor="fu-notes" full><textarea id="fu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <div className="modal-foot"><button type="button" className="btn sec" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy}>{busy && <Loader2 size={15} className="spin-i" />}Schedule</button></div>
      </form>
    </Modal>
  );
}

export default function LeadDetail() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const { can, business } = useAuth();
  const { data: lead, loading, error, reload } = useAsync(() => leadsApi.get(id), [id]);
  const fus = useList(followUpsApi.list, { leadId: id, pageSize: 50, sort: 'dueAt' }, can('followUps', 'view'));
  const [dlg, setDlg] = useState(null); const [busy, setBusy] = useState(false);
  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  const closed = isClosed(lead.status);
  const tpl = business?.settings?.whatsappTemplate; const waOk = business?.settings?.notifications?.whatsapp !== false;
  const wa = waOk ? whatsAppLink(lead.customerPhone, fillTemplate(tpl, { name: lead.customerName, business: business?.name, message: 'Thank you for your inquiry. How can we help you further?' }), business?.settings?.defaultCountryCode) : null;
  const done = () => { setDlg(null); reload(); fus.reload(); };

  async function closeLead(reason) {
    setBusy(true);
    try { await leadsApi.setStatus(lead.id, 'lost', { reason }); toast.success('Lead closed.'); done(); } catch (e) { toast.error(e.message); setDlg(null); } finally { setBusy(false); }
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); } catch { toast.error('Could not copy. Please select the text and copy it manually.'); }
  }

  // ---------- summary figures ----------
  const stages = LEAD_STATUSES.filter((s) => s.value !== 'lost');
  const stageIdx = stages.findIndex((s) => s.value === lead.status); // -1 when the lead is closed / lost
  const age = ageDays(lead.inquiryDate);
  const t = today();
  const late = !closed && lead.nextFollowUp && lead.nextFollowUp < t;
  const canSeeFus = can('followUps', 'view');
  const fuRows = canSeeFus ? fus.rows : [];
  const pendingFu = fuRows.filter((f) => ['scheduled', 'overdue'].includes(f.status));
  const overdueFu = pendingFu.filter((f) => f.status === 'overdue').length;
  const prioTone = lead.priority === 'high' ? 'red' : lead.priority === 'low' ? 'navy' : 'amber';
  const prio = <span className={`prio prio-${lead.priority}`}><i />{lead.priority}</span>;

  return (
    <div className="dash cust lead">
      <div className="crumbs" role="navigation" aria-label="Breadcrumb"><Link to="/leads">Leads</Link><ChevronRight size={13} /><span>{lead.customerName}</span></div>

      <section className="profile">
        <div className="profile-cover" />
        <div className="profile-body">
          <span className={`profile-av av-${hueOf(lead.customerName)}`} aria-hidden="true">{initials(lead.customerName)}</span>
          <div className="profile-info">
            <div className="profile-top">
              <div className="profile-main">
                <div className="profile-title"><h1>{lead.customerName}</h1><StatusBadge status={lead.status} />{prio}</div>
                <p className="profile-sub">
                  <span><Inbox size={14} />Inquiry via {labelOf(SOURCES, lead.source)}</span>
                  <span><CalendarDays size={14} />{fmtDate(lead.inquiryDate)}</span>
                  <span><UserCheck size={14} />Assigned to {lead.assignedName || '-'}</span>
                </p>
              </div>
              <div className="profile-actions no-print">
                {wa && <a className="btn green sm" href={wa} target="_blank" rel="noopener noreferrer" title="Opens WhatsApp. You must press Send there."><MessageCircle size={14} />WhatsApp</a>}
                {can('leads', 'edit') && <button type="button" className="btn sec sm" onClick={() => setDlg('status')}><RefreshCw size={14} />Change status</button>}
                {can('followUps', 'create') && !closed && <button type="button" className="btn sec sm" onClick={() => setDlg('followup')}><CalendarPlus size={14} />Follow-up</button>}
                {can('leads', 'edit') && !closed && <button type="button" className="btn red sm" onClick={() => setDlg('close')}><XCircle size={14} />Close / lost</button>}
                {can('leads', 'edit') && !closed && <button type="button" className="btn green sm" onClick={() => setDlg('convert')}><CheckCircle2 size={14} />Convert</button>}
              </div>
            </div>
            <div className="contact-chips">
              {lead.customerPhone && <span className="chip"><Phone size={13} /><a href={`tel:${lead.customerPhone}`}>{lead.customerPhone}</a><button type="button" className="chip-copy" aria-label="Copy phone number" onClick={() => copy(lead.customerPhone, 'Phone number')}><Copy size={12} /></button></span>}
              <span className="chip"><UserRound size={13} /><Link to={`/customers/${lead.customerId}`}>View customer profile</Link></span>
            </div>
          </div>
        </div>
      </section>

      <section className="card pipeline-card" aria-label="Lead progress">
        <ol className="pipeline">
          {stages.map((s, i) => (
            <li key={s.value} className={i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''} aria-current={i === stageIdx ? 'step' : undefined}>
              <span className="pl-dot">{i < stageIdx ? <Check size={14} /> : i + 1}</span>
              <span className="pl-label">{s.label}</span>
            </li>
          ))}
        </ol>
        {lead.status === 'lost' && <div className="lost-banner" role="status"><XCircle size={18} /><div><b>Closed / lost</b><p>{lead.lostReason || 'No reason was recorded.'}</p></div></div>}
      </section>

      <div className="grid stats">
        <StatCard icon={Clock} tone="indigo" label="Lead age" value={age === null ? '-' : `${age} day${age === 1 ? '' : 's'}`} sub={`Since ${fmtDate(lead.inquiryDate)}`} />
        <StatCard icon={Flag} tone={prioTone} label="Priority" value={labelOf(PRIORITIES, lead.priority)} sub={`Agent: ${lead.assignedName || '-'}`} />
        {canSeeFus && <StatCard icon={CalendarClock} tone={overdueFu ? 'red' : 'sky'} label="Pending follow-ups" value={pendingFu.length} sub={overdueFu ? `${overdueFu} overdue` : `${fuRows.length} in total`} />}
        <StatCard icon={CalendarPlus} tone={late ? 'red' : 'green'} label="Next follow-up" value={fmtDate(lead.nextFollowUp)} sub={late ? 'Overdue' : closed ? 'Lead closed' : lead.nextFollowUp ? 'Scheduled' : 'Not scheduled'} />
      </div>

      <div className="overview-grid">
        <section className="card info-card">
          <h3 className="card-title"><Info size={16} />Lead details</h3>
          <dl className="info-list">
            <div><dt><UserRound size={14} />Customer</dt><dd><Link to={`/customers/${lead.customerId}`}>{lead.customerName}</Link></dd></div>
            <div><dt><Phone size={14} />Phone</dt><dd>{lead.customerPhone || '-'}</dd></div>
            <div><dt><Inbox size={14} />Source</dt><dd>{labelOf(SOURCES, lead.source)}</dd></div>
            <div><dt><CalendarDays size={14} />Inquiry date</dt><dd>{fmtDate(lead.inquiryDate)}</dd></div>
            <div><dt><UserCheck size={14} />Assigned Agent</dt><dd>{lead.assignedName || '-'}</dd></div>
            <div><dt><Flag size={14} />Priority</dt><dd>{prio}</dd></div>
            <div><dt><CalendarClock size={14} />Next follow-up</dt><dd>{fmtDate(lead.nextFollowUp)}</dd></div>
          </dl>
          <div className="note-block"><h4>Requirements</h4><p>{lead.requirements || '-'}</p></div>
          <div className="note-block"><h4><StickyNote size={13} />Notes</h4><p>{lead.notes || '-'}</p></div>
          {lead.lostReason && <div className="note-block danger"><h4>Closed / lost reason</h4><p>{lead.lostReason}</p></div>}
        </section>

        <div className="side-stack">
          {canSeeFus && (
            <section className="card info-card">
              <div className="card-head"><h3 className="card-title"><CalendarClock size={16} />Follow-ups</h3><Link className="link" to="/follow-ups">All follow-ups</Link></div>
              {fus.loading ? <p className="muted">Loading...</p> : !fus.rows.length ? <EmptyState title="No follow-ups scheduled" text="Schedule one so this lead is not forgotten." /> : (
                <ul className="low-list">{fus.rows.map((f) => <li key={f.id}><span className="tl-ico tl-sky"><CalendarClock size={14} /></span><div className="grow"><b>{fmtDateTime(f.dueAt)} - {f.responsibleName}</b><small>{f.notes}{f.outcome ? ` | Outcome: ${f.outcome}` : ''}</small></div><StatusBadge status={f.status} /></li>)}</ul>
              )}
            </section>
          )}
          <section className="card info-card">
            <h3 className="card-title"><History size={16} />Lead history</h3>
            {lead.history.length ? (
              <ul className="tl">
                {[...lead.history].reverse().map((h, i) => {
                  const k = histIcon(h.text); const Icon = k.icon;
                  return <li key={i}><span className={`tl-ico ${k.cls}`}><Icon size={14} /></span><div><p>{h.text}</p><small>{fmtDateTime(h.at)}</small></div></li>;
                })}
              </ul>
            ) : <p className="muted">No history yet.</p>}
          </section>
        </div>
      </div>

      {dlg === 'status' && <StatusModal lead={lead} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'convert' && <ConvertModal lead={lead} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'followup' && <FollowUpModal lead={lead} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'close' && <ConfirmDialog title="Close this lead as lost?" message="The lead will be closed and the reason kept in its history." askReason reasonLabel="Reason for closing" confirmLabel="Close lead" busy={busy} onCancel={() => setDlg(null)} onConfirm={closeLead} />}
    </div>
  );
}