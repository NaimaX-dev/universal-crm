import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Target, CalendarClock, Wrench, Package, FileText, Receipt, Repeat, ShoppingCart, Wallet, BarChart3, UserCog, Settings, Menu, LogOut, PanelLeftClose, Layers, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Users, module: 'customers' },
  { to: '/leads', label: 'Leads', icon: Target, module: 'leads' },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock, module: 'followUps' },
  { to: '/services', label: 'Services', icon: Wrench, module: 'services' },
  { to: '/packages', label: 'Packages', icon: Package, module: 'packages' },
  { to: '/quotations', label: 'Quotations', icon: FileText, module: 'quotations' },
  { to: '/invoices', label: 'Invoices', icon: Receipt, module: 'invoices' },
  { to: '/subscriptions', label: 'Subscriptions', icon: Repeat, module: 'subscriptions' },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart, module: 'purchases' },
  { to: '/payments', label: 'Payments', icon: Wallet, module: 'payments' },
  { to: '/reports', label: 'Reports', icon: BarChart3, module: 'reports' },
  { to: '/agents', label: 'Agents', icon: UserCog, admin: true },
  { to: '/activity', label: 'Activity log', icon: History, admin: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const TITLES = [['/customers', 'Customers'], ['/leads', 'Leads'], ['/follow-ups', 'Follow-ups'], ['/services', 'Services'], ['/packages', 'Packages'], ['/quotations', 'Quotations'], ['/invoices', 'Invoices'], ['/subscriptions', 'Subscriptions'], ['/purchases', 'Purchases'], ['/payments', 'Payments'], ['/reports', 'Reports'], ['/agents', 'Agents'], ['/activity', 'Activity log'], ['/settings', 'Settings']];

export default function Layout() {
  const { user, business, logout, can, isAdmin } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const title = loc.pathname === '/' ? 'Dashboard' : TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1] || 'Universal CRM';
  const items = NAV.filter((n) => (n.admin ? isAdmin : n.module ? can(n.module, 'view') : true));

  return (
    <div className={collapsed ? 'is-collapsed' : ''}>
      <aside className={`side${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark"><Layers size={19} /></div>
          <div className="brand-text"><b>Universal CRM</b><span>{business?.name}</span></div>
          <button type="button" className="icon-btn dark desk-toggle" aria-label="Collapse sidebar" onClick={() => setCollapsed((c) => !c)}><PanelLeftClose size={17} /></button>
        </div>
        <nav>
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={() => setOpen(false)} title={n.label}>
              <n.icon size={18} /><span className="nav-text">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">{business?.name}</div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="top">
          <button type="button" className="icon-btn burger" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="top-title"><h2>{title}</h2></div>
          <div className="top-right">
            <div className="user">
              <div className="avatar">{user?.name?.[0]}</div>
              <div className="user-text"><b>{user?.name}</b><span>{user?.role}</span></div>
              <button type="button" className="icon-btn" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button>
            </div>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
