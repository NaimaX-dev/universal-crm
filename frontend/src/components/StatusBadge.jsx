const TONE = {
  active: 'ok', inactive: 'muted', new: 'info', contacted: 'info', follow_up: 'warn', interested: 'info', converted: 'ok', lost: 'err',
  scheduled: 'info', overdue: 'err', completed: 'ok', cancelled: 'muted', draft: 'muted', sent: 'info', accepted: 'ok', rejected: 'err', expired: 'warn',
  issued: 'info', partially_paid: 'warn', paid: 'ok', paused: 'warn', pending: 'warn', failed: 'err', voided: 'muted', recorded: 'info', partial: 'warn', unpaid: 'err',
};
const LABEL = { new: 'New inquiry', follow_up: 'Follow-up', lost: 'Closed / lost', partially_paid: 'Partially paid' };

// tone (optional): 'ok' | 'warn' | 'err' | 'info' | 'muted' forces the colour, e.g. for a status this list does not know.
export default function StatusBadge({ status, label, tone }) {
  if (!status) return <span className="muted">-</span>;
  return <span className={`badge b-${tone || TONE[status] || 'muted'}`} data-status={status}><span className="dot" />{label || LABEL[status] || String(status).replace(/_/g, ' ')}</span>;
}