import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound({ standalone = false }) {
  const body = (
    <div className="card" style={{ maxWidth: 520, margin: standalone ? '0' : '40px auto' }}>
      <div className="empty">
        <div className="empty-art"><Compass size={24} /></div>
        <h4>Page not found</h4><p>The page you are looking for does not exist or was moved.</p>
        <Link className="btn" to="/">Go to dashboard</Link>
      </div>
    </div>
  );
  return standalone ? <div className="auth-page">{body}</div> : body;
}
