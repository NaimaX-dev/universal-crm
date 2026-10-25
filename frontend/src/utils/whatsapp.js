import { config } from '../config';

// Builds a WhatsApp click-to-chat link. The USER still has to press "Send" inside WhatsApp:
// this app never sends WhatsApp messages automatically.
export function whatsAppLink(phone, message = '', defaultCountryCode = '') {
  let digits = String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (!digits) return null;
  if (digits.startsWith('0') && defaultCountryCode) digits = String(defaultCountryCode).replace(/\D/g, '') + digits.slice(1);
  const text = encodeURIComponent(message);
  const base = config.whatsappBase;
  return base.includes('?') ? `${base}${digits}&text=${text}` : `${base.replace(/\/+$/, '')}/${digits}?text=${text}`;
}

export function fillTemplate(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}
