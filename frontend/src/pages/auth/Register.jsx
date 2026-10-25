import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Layers, Loader2 } from 'lucide-react';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { EntityForm, validateFields } from '../../components/Field.jsx';

const FIELDS = [
  { name: 'businessName', label: 'Business name', required: true, full: true },
  { name: 'businessType', label: 'Business type', placeholder: 'e.g. Clinic, Travel agency, Repair shop, Software house', full: true },
  { name: 'adminName', label: 'Your full name (Admin)', required: true },
  { name: 'email', label: 'Your email (used to sign in)', type: 'email', required: true },
  { name: 'password', label: 'Password', type: 'password', required: true, minLength: 8, help: 'At least 8 characters, with a letter and a number.' },
  { name: 'confirm', label: 'Confirm password', type: 'password', required: true, validate: (v, all) => (v !== all.password ? 'Passwords do not match.' : '') },
];

// Creates a NEW business and its first Admin account. Available only if the PHP API has registration enabled.
export default function Register() {
  const { user, applySession } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const [options, setOptions] = useState(null); const [values, setValues] = useState({ businessName: '', businessType: '', adminName: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { authApi.options().then(setOptions).catch((e) => setError(e.message)); }, []);
  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault(); if (busy) return;
    const errs = validateFields(FIELDS, values); setErrors(errs); setError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { confirm, ...body } = values;
      const r = await authApi.registerBusiness(body);
      applySession(r); toast.success('Business created. Next: complete your business profile in Settings.'); nav('/settings', { replace: true });
    } catch (ex) { setErrors(ex.errors || {}); setError(ex.errors ? 'Please correct the highlighted fields.' : ex.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <div className="auth-brand"><div className="auth-brand-mark"><Layers size={21} /></div><span className="auth-brand-name">Universal CRM</span></div>
        <h1>Register your business</h1>
        <p className="sub">Create your business and its Admin account. You can then complete the business profile and add Agents.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        {options && !options.registrationEnabled ? (
          <div className="warn-box">Self-registration is turned off on this server. Ask the system administrator to create your business (see README: <code>php bin/create_business.php</code>).</div>
        ) : (
          <form onSubmit={submit} noValidate>
            <EntityForm fields={FIELDS} values={values} errors={errors} onChange={(k, v) => { setValues((s) => ({ ...s, [k]: v })); setErrors((s) => ({ ...s, [k]: undefined })); }} />
            <button type="submit" className="auth-btn" disabled={busy || !options}>{busy && <Loader2 size={16} className="spin-i" />}Create business and sign in</button>
          </form>
        )}
        <div className="auth-foot"><Link className="link" to="/login">Back to sign in</Link></div>
      </div>
    </div>
  );
}