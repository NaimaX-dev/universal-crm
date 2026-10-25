import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// Open modals, topmost last. Only the top one reacts to Escape and Tab, so a dialog opened over another one closes on its own.
const stack = [];
let scrollLocks = 0;
let prevOverflow = '';
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// icon (optional lucide component) + subtitle (optional text) switch the header to the coloured "brand" style used by the create/edit forms.
export default function Modal({ title, onClose, children, wide = false, icon: Icon, subtitle }) {
  const titleId = `modal-title-${useId().replace(/:/g, '')}`;
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const token = {};
    stack.push(token);
    const opener = document.activeElement;
    if (scrollLocks === 0) { prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    scrollLocks += 1;
    const node = ref.current;

    // Put keyboard focus inside the dialog (unless a child already took it with autoFocus).
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector('.modal-body')?.querySelector(FOCUSABLE) || node.querySelector(FOCUSABLE) || node;
      first.focus();
    }

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (!items.length) { e.preventDefault(); node.focus(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div className="ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={`modal-head${Icon ? ' brand' : ''}`}>
          {Icon && <span className="modal-ico" aria-hidden="true"><Icon size={20} /></span>}
          <div className="modal-titles"><h3 id={titleId}>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}