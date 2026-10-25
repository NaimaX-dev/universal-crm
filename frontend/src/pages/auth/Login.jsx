import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { Layers, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Field } from '../../components/Field.jsx';
import { authApi } from '../../api/authApi';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({}); const [error, setError] = useState('');
  const [options, setOptions] = useState(null);

  // Ask the API whether business self-registration is enabled (also proves the API is reachable).
  useEffect(() => { authApi.options().then(setOptions).catch((e) => setError(e.message)); }, []);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  async function submit(e) {
    e.preventDefault(); if (busy) return;
    const errs = {};
    if (!email.trim()) errs.email = 'Enter your email address.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setErrors(errs); setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { await login(email.trim(), password); nav(loc.state?.from || '/', { replace: true }); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark"><Layers size={21} /></div>
          <span className="auth-brand-name">Universal CRM</span>
        </div>
        <h1>Welcome back</h1>
        <p className="sub">One CRM for Different Types of Businesses</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <form onSubmit={submit} noValidate>
          <div className="auth-fields">
            <Field label="Email address" htmlFor="email" error={errors.email}><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <div className="pw-wrap">
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </Field>
          </div>
          <button type="submit" className="auth-btn" disabled={busy}>{busy && <Loader2 size={16} className="spin-i" />}{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {options?.registrationEnabled && <div className="auth-foot"><span>New business? </span><Link className="link" to="/register">Register your business</Link></div>}
        {options && !options.registrationEnabled && <div className="auth-foot">Accounts are created by your Business Admin. Forgot your password? Ask your Admin to set a new one.</div>}
      </div>
    </div>
  );
}