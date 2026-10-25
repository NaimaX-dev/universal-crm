import { Routes, Route } from 'react-router-dom';
import Layout from '../layouts/Layout.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import Login from '../pages/auth/Login.jsx';
import Register from '../pages/auth/Register.jsx';
import ActivityPage from '../pages/activity/ActivityPage.jsx';
import Dashboard from '../pages/dashboard/Dashboard.jsx';
import AgentsPage from '../pages/agents/AgentsPage.jsx';
import CustomersPage from '../pages/customers/CustomersPage.jsx';
import CustomerDetail from '../pages/customers/CustomerDetail.jsx';
import LeadsPage from '../pages/leads/LeadsPage.jsx';
import LeadDetail from '../pages/leads/LeadDetail.jsx';
import FollowUpsPage from '../pages/follow-ups/FollowUpsPage.jsx';
import ServicesPage from '../pages/services/ServicesPage.jsx';
import PackagesPage from '../pages/packages/PackagesPage.jsx';
import DocumentsPage from '../pages/quotations/DocumentsPage.jsx';
import DocumentEditor from '../pages/quotations/DocumentEditor.jsx';
import DocumentView from '../pages/quotations/DocumentView.jsx';
import SubscriptionsPage from '../pages/subscriptions/SubscriptionsPage.jsx';
import PurchasesPage from '../pages/purchases/PurchasesPage.jsx';
import PaymentsPage from '../pages/payments/PaymentsPage.jsx';
import ReceiptPage from '../pages/payments/ReceiptPage.jsx';
import ReportsPage from '../pages/reports/ReportsPage.jsx';
import SettingsPage from '../pages/settings/SettingsPage.jsx';
import NotFound from '../pages/NotFound.jsx';

const guard = (el, module, extra = {}) => <ProtectedRoute module={module} {...extra}>{el}</ProtectedRoute>;

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={guard(<CustomersPage />, 'customers')} />
        <Route path="customers/:id" element={guard(<CustomerDetail />, 'customers')} />
        <Route path="leads" element={guard(<LeadsPage />, 'leads')} />
        <Route path="leads/:id" element={guard(<LeadDetail />, 'leads')} />
        <Route path="follow-ups" element={guard(<FollowUpsPage />, 'followUps')} />
        <Route path="services" element={guard(<ServicesPage />, 'services')} />
        <Route path="packages" element={guard(<PackagesPage />, 'packages')} />
        <Route path="quotations" element={guard(<DocumentsPage kind="quotation" />, 'quotations')} />
        <Route path="quotations/new" element={guard(<DocumentEditor kind="quotation" />, 'quotations', { action: 'create' })} />
        <Route path="quotations/:id" element={guard(<DocumentView kind="quotation" />, 'quotations')} />
        <Route path="quotations/:id/edit" element={guard(<DocumentEditor kind="quotation" />, 'quotations', { action: 'edit' })} />
        <Route path="invoices" element={guard(<DocumentsPage kind="invoice" />, 'invoices')} />
        <Route path="invoices/new" element={guard(<DocumentEditor kind="invoice" />, 'invoices', { action: 'create' })} />
        <Route path="invoices/:id" element={guard(<DocumentView kind="invoice" />, 'invoices')} />
        <Route path="invoices/:id/edit" element={guard(<DocumentEditor kind="invoice" />, 'invoices', { action: 'edit' })} />
        <Route path="subscriptions" element={guard(<SubscriptionsPage />, 'subscriptions')} />
        <Route path="purchases" element={guard(<PurchasesPage />, 'purchases')} />
        <Route path="payments" element={guard(<PaymentsPage />, 'payments')} />
        <Route path="payments/:id/receipt" element={guard(<ReceiptPage />, 'payments')} />
        <Route path="reports" element={guard(<ReportsPage />, 'reports')} />
        <Route path="agents" element={guard(<AgentsPage />, null, { adminOnly: true })} />
        <Route path="activity" element={guard(<ActivityPage />, null, { adminOnly: true })} />
        <Route path="activity" element={guard(<ActivityPage />, null, { adminOnly: true })} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound standalone />} />
    </Routes>
  );
}
