// Modules and the permission actions each module supports.
// The UI uses this to show/hide things. THE PHP API MUST ENFORCE THE SAME RULES.
export const ACTION_LABELS = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete / deactivate', manage: 'Manage',
};

export const MODULES = [
  { key: 'customers', label: 'Customers', actions: ['view', 'create', 'edit', 'delete'], manageHint: '' },
  { key: 'leads', label: 'Leads', actions: ['view', 'create', 'edit', 'delete', 'manage'], manageHint: 'Manage = assign leads to other Agents' },
  { key: 'followUps', label: 'Follow-ups', actions: ['view', 'create', 'edit', 'delete', 'manage'], manageHint: "Manage = assign follow-ups to other Agents" },
  { key: 'services', label: 'Services', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'packages', label: 'Packages', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'quotations', label: 'Quotations', actions: ['view', 'create', 'edit', 'delete', 'manage'], manageHint: 'Manage = convert to invoice' },
  { key: 'invoices', label: 'Invoices', actions: ['view', 'create', 'edit', 'delete', 'manage'], manageHint: 'Manage = cancel invoices' },
  { key: 'subscriptions', label: 'Subscriptions', actions: ['view', 'create', 'edit', 'delete', 'manage'], manageHint: 'Manage = renew, pause, cancel' },
  { key: 'purchases', label: 'Purchases', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'payments', label: 'Payments', actions: ['view', 'create', 'edit', 'delete', 'manage'], manageHint: 'Manage = void / confirm / fail payments' },
  { key: 'reports', label: 'Reports', actions: ['view'] },
];

export const ALL_ACTIONS = ['view', 'create', 'edit', 'delete', 'manage'];

export function emptyPermissions() {
  const p = {};
  MODULES.forEach((m) => { p[m.key] = {}; });
  return p;
}

// Starting point offered when a new Agent is created.
export function defaultAgentPermissions() {
  const p = emptyPermissions();
  p.customers = { view: true, create: true, edit: true };
  p.leads = { view: true, create: true, edit: true };
  p.followUps = { view: true, create: true, edit: true };
  p.services = { view: true };
  p.packages = { view: true };
  p.reports = { view: true };
  return p;
}
