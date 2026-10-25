export const SOURCES = [
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' }, { value: 'phone', label: 'Phone call' },
  { value: 'website', label: 'Website' }, { value: 'walk-in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' }, { value: 'other', label: 'Other' },
];
export const LEAD_STATUSES = [
  { value: 'new', label: 'New inquiry' }, { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow-up required' }, { value: 'interested', label: 'Interested' },
  { value: 'converted', label: 'Converted' }, { value: 'lost', label: 'Closed / lost' },
];
export const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }];
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card (recorded manually)' }, { value: 'cheque', label: 'Cheque' },
  { value: 'mobile_wallet', label: 'Mobile wallet' }, { value: 'other', label: 'Other' },
];
export const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' },
];

export const labelOf = (list, value) => list.find((x) => x.value === value)?.label || value || '-';
export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate();
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return isoDate(d); };
export function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(v) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : `${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}
export function money(n, symbol = '$') {
  const v = Number(n || 0);
  return `${symbol}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const toLocalInput = (v) => (v ? String(v).slice(0, 16) : '');
export function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(`${String(iso).slice(0, 10)}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 86400000);
}
