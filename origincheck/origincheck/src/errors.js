export class HttpError extends Error {
  constructor(status, code, state, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.state = state; // UI state: unsupported-input | rate-limited | service-unavailable | insufficient-text | error
    this.extra = extra;
  }
}

// kind: rate_limited | unavailable | unsupported | bad_response
// Messages are generic on purpose: never include secrets, URLs with keys, or submitted content.
export class ProviderError extends Error {
  constructor(kind, message = 'Provider error') {
    super(message);
    this.kind = kind;
  }
}
