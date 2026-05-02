export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiRateLimitError extends ApiError {
  constructor(public retryAfterSec: number) {
    super(429, `Rate limited; retry after ${retryAfterSec}s`);
    this.name = 'ApiRateLimitError';
  }
}

export class ApiServerError extends ApiError {
  constructor(code: number, message: string) {
    super(code, message);
    this.name = 'ApiServerError';
  }
}

export class ApiNotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'ApiNotFoundError';
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Network unreachable');
    this.name = 'NetworkError';
  }
}
