import { useState } from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import Modal from './Modal.jsx';

// askReason: shows a required text box and passes the text to onConfirm(reason).
// danger (default): red icon and button, and keyboard focus starts on Cancel so a stray Enter never confirms. danger={false}: blue icon, focus starts on the confirm button.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = true, busy = false, askReason = false, reasonLabel = 'Reason', onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = askReason && !reason.trim();
  const Icon = danger ? AlertTriangle : Info;
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm">
        <div className={`confirm-icon${danger ? '' : ' info'}`}><Icon size={20} /></div>
        <p>{message}</p>
      </div>
      {askReason && (
        <div className={`field mt${touched && missing ? ' has-err' : ''}`}>
          <label htmlFor="confirm-reason">{reasonLabel}<em>*</em></label>
          <textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus aria-invalid={touched && missing ? 'true' : undefined} aria-describedby={touched && missing ? 'confirm-reason-err' : undefined} />
          {touched && missing && <span id="confirm-reason-err" className="err-msg">This is required.</span>}
        </div>
      )}
      <div className="modal-foot">
        <button type="button" className="btn sec" onClick={onCancel} disabled={busy} autoFocus={!askReason && danger}>Cancel</button>
        <button type="button" className={`btn${danger ? ' red' : ''}`} disabled={busy} autoFocus={!askReason && !danger} onClick={() => { setTouched(true); if (!missing) onConfirm(reason.trim()); }}>
          {busy && <Loader2 size={15} className="spin-i" />}{confirmLabel}
        </button>
      </div>
    </Modal>
  );
}