import { quotationsApi } from '../../api/quotationsApi';
import { invoicesApi } from '../../api/invoicesApi';

export const DOC = {
  quotation: {
    kind: 'quotation', label: 'Quotation', plural: 'Quotations', api: quotationsApi, module: 'quotations', base: '/quotations', secondKey: 'expiryDate', secondLabel: 'Expiry date',
    statuses: [{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Rejected' }, { value: 'expired', label: 'Expired' }],
    editable: (d) => ['draft', 'sent'].includes(d.storedStatus) && !d.invoiceId,
  },
  invoice: {
    kind: 'invoice', label: 'Invoice', plural: 'Invoices', api: invoicesApi, module: 'invoices', base: '/invoices', secondKey: 'dueDate', secondLabel: 'Due date',
    statuses: [{ value: 'draft', label: 'Draft' }, { value: 'issued', label: 'Issued' }, { value: 'partially_paid', label: 'Partially paid' }, { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' }],
    editable: (d) => d.storedStatus === 'draft' || (d.storedStatus === 'issued' && !(d.paid > 0)),
  },
};
