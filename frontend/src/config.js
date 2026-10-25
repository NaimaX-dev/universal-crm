// Central place for environment configuration (see .env.example).
const env = import.meta.env;

export const config = {
  // Base URL of the PHP REST API (no trailing slash), e.g. http://localhost:8000
  apiBaseUrl: String(env.VITE_API_BASE_URL || '').replace(/\/+$/, ''),
  // WhatsApp click-to-chat base. https://wa.me  or  https://web.whatsapp.com/send?phone=
  whatsappBase: env.VITE_WHATSAPP_BASE_URL || 'https://wa.me',
};
