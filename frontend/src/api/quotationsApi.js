import { request, unwrap, makeResource } from './apiClient';
export const quotationsApi = {
  ...makeResource('/quotations'),
  convertToInvoice: (id, body) => request('POST', `/quotations/${id}/convert-to-invoice`, { body }).then(unwrap),
};
