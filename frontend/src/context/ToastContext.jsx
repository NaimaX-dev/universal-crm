import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

// type -> [icon, title, how long it stays on screen (ms)]
const META = {
  ok: [CheckCircle2, 'Success', 3500],
  err: [AlertCircle, 'Error', 6000],
  info: [Info, 'Notice', 4500],
  warn: [AlertTriangle, 'Warning', 6000],
};

// One toast. It removes itself after its time is up; hovering or focusing it pauses the countdown.
function ToastItem({ toast, remove }) {
  const { id, type, message } = toast;
  const [Icon, title, ms] = META[type];
  const [paused, setPaused] = useState(false);
  const left = useRef(ms); const since = useRef(0);
  const close = useCallback(() => remove(id), [remove, id]);
  useEffect(() => {
    if (paused) return undefined;
    since.current = Date.now();
    const t = setTimeout(close, left.current);
    return () => { clearTimeout(t); left.current -= Date.now() - since.current; };
  }, [paused, close]);
  return (
    <div
      className={`toast t-${type}${paused ? ' paused' : ''}`} role={type === 'err' ? 'alert' : undefined} style={{ '--dur': `${ms}ms` }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    >
      <div className="toast-ico"><Icon size={18} /></div>
      <div className="toast-body"><b>{title}</b><p>{message}</p></div>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={close}><X size={16} /></button>
      <i className="toast-bar" aria-hidden="true" />
    </div>
  );
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);
  const remove = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message) => {
    const id = ++idRef.current;
    setItems((l) => [...l.slice(-3), { id, type, message }]);
  }, []);
  // success() and error() are what the app already uses; info() and warning() are new optional extras.
  const api = useMemo(() => ({ success: (m) => push('ok', m), error: (m) => push('err', m), info: (m) => push('info', m), warning: (m) => push('warn', m) }), [push]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <ToastItem key={t.id} toast={t} remove={remove} />)}
      </div>
    </ToastCtx.Provider>
  );
}