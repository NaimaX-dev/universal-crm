import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from '../components/EmptyState.jsx';

// Route guard = better user experience ONLY. The PHP API enforces real access control.
export default function ProtectedRoute({ children, module, action = 'view', adminOnly = false }) {
  const { user, loading, can, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <div style={{ padding: 24 }}><PageLoader text="Restoring your session..." /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if ((adminOnly && !isAdmin) || (module && !can(module, action))) {
    return (
      <div className="card"><div className="empty"><div className="empty-art" style={{ background: 'var(--warn-50)', color: 'var(--warn)' }}><ShieldAlert size={24} /></div>
        <h4>You do not have access to this page</h4><p>Ask your Business Admin to grant the required permission.</p></div></div>
    );
  }
  return children;
}
