import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CalendarClock, MessageCircle, Trash2, Loader2 } from 'lucide-react';
import ResourceList from '../../components/ResourceList.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { Field } from '../../components/Field.jsx';
import { followUpsApi } from '../../api/followUpsApi';
import { useTeam } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDateTime, toLocalInput, daysUntil, isoDate, pad } from '../../utils/format';
import { whatsAppLink, fillTemplate } from '../../utils/whatsapp';

// ---------- small presentational helpers (UI only, no data logic) ----------
const initials = (name = '') => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const hueOf = (s) => [...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
function Avatar({ name, small = false }) {
  return <span className={`cell-av av-${hueOf(name)}${small ? ' sm' : ''}`} aria-hidden="true">{initials(name)}</span>;
}

// "Overdue by 2d", "in 35 min", "Tomorrow" ... only for follow-ups that are still scheduled.
function dueInfo(r) {
  if (r.storedStatus !== 'scheduled') return null;
  const due = new Date(r.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const mins = Math.round((due - new Date()) / 60000);
  if (mins < 0) {
    const m = -mins;
    return { tone: 'late', label: m < 60 ? `${m} min overdue` : m < 1440 ? `${Math.floor(m / 60)}h overdue` : `${Math.floor(m / 1440)}d overdue` };
  }
  if (r.isToday) return { tone: 'soon', label: mins < 1 ? 'Due now' : mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)}h` };
  const d = daysUntil(r.dueAt);
  return { tone: '', label: d === 1 ? 'Tomorrow' : `in ${d} days` };
}

// 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">
const localInput = (d) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };

const OUTCOME_HINTS = ['Called - no answer', 'Spoke - interested', 'Sent details on WhatsApp', 'Needs more time', 'Not interested'];
const SNOOZE = [['In 1 hour', () => new Date(Date.now() + 3600000)], ['Tomorrow, 10:00', () => at(1, 10)], ['In 3 days', () => at(3, 10)], ['Next week', () => at(7, 10)]];

function CompleteModal({ row, onClose, onDone }) {
  const toast = useToast(); const [outcome, setOutcome] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [again, setAgain] = useState(false); const [nextDue, setNextDue] = useState(() => localInput(at(1, 10))); const [nextErr, setNextErr] = useState('');
  async function save(e) {
    e.preventDefault(); if (busy) return;
    if (outcome.trim().length < 3) { setErr('Please record the outcome of this follow-up.'); return; }
    if (again && !nextDue) { setNextErr('Choose the date and time of the next follow-up.'); return; }
    setBusy(true);
    try {
      await followUpsApi.complete(row.id, outcome.trim());
      toast.success('Follow-up completed.');
      if (again) {
        try {
          await followUpsApi.create({ customerId: row.customerId, leadId: row.leadId || undefined, responsibleId: row.responsibleId, dueAt: nextDue, notes: '' });
          toast.success('Next follow-up scheduled.');
        } catch (ex) { toast.error(`Completed, but the next follow-up could not be scheduled: ${ex.errors?.dueAt || ex.message}`); }
      }
      onDone();
    } catch (ex) { setErr(ex.errors?.outcome || ex.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Complete follow-up: ${row.customerName}`} onClose={onClose}>
      <form onSubmit={save} noValidate>
        <Field label="Outcome" required htmlFor="c-out" error={err} full><textarea id="c-out" value={outcome} onChange={(e) => { setOutcome(e.target.value); setErr(''); }} placeholder="What happened? What was agreed?" autoFocus /></Field>
        <div className="quick-chips" aria-label="Quick outcomes">
          {OUTCOME_HINTS.map((h) => <button key={h} type="button" className="qchip" onClick={() => { setOutcome((o) => (o.trim() ? `${o.trim()}. ${h}` : h)); setErr(''); }}>{h}</button>)}
        </div>
        <label className="check-row"><input type="checkbox" checked={again} onChange={(e) => { setAgain(e.target.checked); setNextErr(''); }} /><span><b>Schedule the next follow-up</b><small>Keeps this customer from being forgotten.</small></span></label>
        {again && <Field label="Next follow-up date and time" required htmlFor="c-next" error={nextErr} full><input id="c-next" type="datetime-local" value={nextDue} onChange={(e) => { setNextDue(e.target.value); setNextErr(''); }} /></Field>}
        <div className="modal-foot"><button type="button" className="btn sec" onClick={onClose}>Cancel</button><button type="submit" className="btn green" disabled={busy}>{busy && <Loader2 size={15} className="spin-i" />}Mark complete</button></div>
      </form>
    </Modal>
  );
}
function RescheduleModal({ row, onClose, onDone }) {
  const toast = useToast(); const [dueAt, setDueAt] = useState(toLocalInput(row.dueAt)); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); if (busy) return;
    if (!dueAt) { setErr('Choose the new date and time.'); return; }
    setBusy(true);
    try { await followUpsApi.reschedule(row.id, dueAt, note); toast.success('Follow-up rescheduled.'); onDone(); } catch (ex) { setErr(ex.errors?.dueAt || ex.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Reschedule: ${row.customerName}`} onClose={onClose}>
      <form onSubmit={save} noValidate>
        <div className="quick-chips" aria-label="Quick reschedule">
          {SNOOZE.map(([label, make]) => <button key={label} type="button" className="qchip" onClick={() => { setDueAt(localInput(make())); setErr(''); }}>{label}</button>)}
        </div>
        <div className="form-grid">
          <Field label="New date and time" required htmlFor="r-due" error={err} full><input id="r-due" type="datetime-local" value={dueAt} onChange={(e) => { setDueAt(e.target.value); setErr(''); }} /></Field>
          <Field label="Reason (optional)" htmlFor="r-note" full><input id="r-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="modal-foot"><button type="button" className="btn sec" onClick={onClose}>Cancel</button><button type="submit" className="btn" disabled={busy}>{busy && <Loader2 size={15} className="spin-i" />}Reschedule</button></div>
      </form>
    </Modal>
  );
}

export default function FollowUpsPage() {
  const { can, business, user } = useAuth(); const toast = useToast();
  const { options } = useTeam();
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const canAssign = can('followUps', 'manage');
  const waOn = business?.settings?.notifications?.whatsapp !== false;

  const fields = [
    { name: 'customer', section: 'Customer', label: 'Customer', type: 'customer', required: true },
    { name: 'responsibleId', section: 'Schedule', label: 'Responsible Agent', type: 'select', options, disabled: !canAssign, help: canAssign ? undefined : 'Follow-ups you add are assigned to you.' },
    { name: 'dueAt', section: 'Schedule', label: 'Date and time', type: 'datetime-local', required: true },
    { name: 'notes', section: 'Notes', label: 'Notes', type: 'textarea' },
  ];

  async function del() {
    setBusy(true);
    try { await followUpsApi.remove(dlg.row.id); toast.success('Follow-up deleted.'); dlg.reload(); setDlg(null); } catch (e) { toast.error(e.message); setDlg(null); } finally { setBusy(false); }
  }

  return (
    <>
      <ResourceList
        title="Follow-ups and reminders" subtitle="Upcoming, overdue and completed follow-ups (in-app reminders)" entity="follow-up" api={followUpsApi} module="followUps"
        tabs={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'overdue', label: 'Overdue' }, { value: 'completed', label: 'Completed' }, { value: 'all', label: 'All' }]}
        searchPlaceholder="Search follow-ups..." defaultSort="dueAt" fields={fields} createLabel="Schedule follow-up"
        initialValues={{ customer: null, responsibleId: user.id, dueAt: '', notes: '' }}
        canEditRow={(r) => r.storedStatus === 'scheduled'}
        toForm={(r) => ({ customer: { id: r.customerId, name: r.customerName }, responsibleId: r.responsibleId, dueAt: toLocalInput(r.dueAt), notes: r.notes })}
        toPayload={(v, row) => (row ? { dueAt: v.dueAt, notes: v.notes, responsibleId: v.responsibleId || undefined } : { customerId: v.customer.id, responsibleId: v.responsibleId || undefined, dueAt: v.dueAt, notes: v.notes, leadId: v.leadId })}
        columns={[
          {
            key: 'dueAt', label: 'Due', sortable: true,
            render: (r) => { const info = dueInfo(r); return <div className="due-cell"><b>{fmtDateTime(r.dueAt)}</b>{info && <span className={`due-rel ${info.tone}`}>{info.label}</span>}</div>; },
          },
          {
            key: 'customerName', label: 'Customer', sortable: true,
            render: (r) => (
              <div className="cell-person">
                <Avatar name={r.customerName} />
                <div><Link className="cell-link" to={`/customers/${r.customerId}`}>{r.customerName}</Link><small>{r.notes}</small></div>
              </div>
            ),
          },
          { key: 'responsibleName', label: 'Responsible', sortable: true, render: (r) => (r.responsibleName ? <span className="agent-chip"><Avatar name={r.responsibleName} small />{r.responsibleName}</span> : <span className="muted">Unassigned</span>) },
          { key: 'outcome', label: 'Outcome', render: (r) => (r.outcome ? <span className="clamp" title={r.outcome}>{r.outcome}</span> : <span className="muted">-</span>) },
          { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rowActions={(r, { reload }) => {
          const open = r.storedStatus === 'scheduled';
          const wa = waOn && whatsAppLink(r.customerPhone, fillTemplate(business?.settings?.whatsappTemplate, { name: r.customerName, business: business?.name, message: 'This is a reminder about our follow-up.' }), business?.settings?.defaultCountryCode);
          return (
            <>
              {wa && <a className="icon-btn ok" href={wa} target="_blank" rel="noopener noreferrer" title="Open WhatsApp (you press Send)" aria-label="Open WhatsApp"><MessageCircle size={16} /></a>}
              {open && can('followUps', 'edit') && <button type="button" className="icon-btn ok" title="Mark complete" aria-label="Mark complete" onClick={() => setDlg({ type: 'complete', row: r, reload })}><CheckCircle2 size={16} /></button>}
              {open && can('followUps', 'edit') && <button type="button" className="icon-btn" title="Reschedule" aria-label="Reschedule" onClick={() => setDlg({ type: 'reschedule', row: r, reload })}><CalendarClock size={16} /></button>}
              {can('followUps', 'delete') && <button type="button" className="icon-btn danger" title="Delete" aria-label="Delete" onClick={() => setDlg({ type: 'delete', row: r, reload })}><Trash2 size={16} /></button>}
            </>
          );
        }}
      />
      {dlg?.type === 'complete' && <CompleteModal row={dlg.row} onClose={() => setDlg(null)} onDone={() => { dlg.reload(); setDlg(null); }} />}
      {dlg?.type === 'reschedule' && <RescheduleModal row={dlg.row} onClose={() => setDlg(null)} onDone={() => { dlg.reload(); setDlg(null); }} />}
      {dlg?.type === 'delete' && <ConfirmDialog title="Delete follow-up?" message="This permanently removes the follow-up." confirmLabel="Delete" busy={busy} onCancel={() => setDlg(null)} onConfirm={del} />}
    </>
  );
}