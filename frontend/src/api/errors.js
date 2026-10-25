// Error thrown by every API call (real or demo). Pages read .message, .status and .errors.
export class ApiError extends Error {
  constructor(message, status = 0, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;          // HTTP status (0 = network/config problem)
    this.errors = extra.errors || null; // field errors: { fieldName: 'message' }
    this.code = extra.code || null;     // e.g. DUPLICATE, NETWORK, CONFIG
    this.data = extra.data || null;
  }
}
