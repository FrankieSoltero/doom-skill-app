/**
 * The one error the API client (`src/api/client.ts`) gives for a request that failed. It holds
 * what a screen needs to choose its message, the kind and the HTTP status, and nothing else: never
 * the response body (the server's text is not shown), the access token or the URL, whose query
 * can hold what the user typed. Its message is built from the kind and status only, so it is safe
 * to log.
 */

type ApiErrorKind =
  /** No answer: the network failed (status 0). */
  | 'offline'
  /** No answer within the client's time limit (status 0). */
  | 'timeout'
  /** 401 or 403: no session, or the server refused it. */
  | 'unauthorized'
  | 'notFound'
  /** 409: the request conflicts with the server's state, such as an unfinished set. */
  | 'conflict'
  /** 429: too many requests. */
  | 'rateLimited'
  /** Any other 4xx, 422 included: the request itself was refused. */
  | 'invalid'
  /** 502, 503, 504: the server or what it depends on is down for now. */
  | 'unavailable'
  /** Any other status: a fault on the server. */
  | 'server';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind: ApiErrorKind;
  /** The HTTP status, or 0 when no answer came. */
  readonly status: number;

  constructor(kind: ApiErrorKind, status: number) {
    super(`API request failed: ${kind} (${String(status)})`);
    this.kind = kind;
    this.status = status;
  }
}

const KIND_BY_STATUS: Readonly<Record<number, ApiErrorKind>> = {
  401: 'unauthorized',
  403: 'unauthorized',
  404: 'notFound',
  409: 'conflict',
  429: 'rateLimited',
  502: 'unavailable',
  503: 'unavailable',
  504: 'unavailable',
};

/** The error for a response with a status outside 2xx. */
export function errorForStatus(status: number): ApiError {
  const clientError = status >= 400 && status < 500;
  return new ApiError(KIND_BY_STATUS[status] ?? (clientError ? 'invalid' : 'server'), status);
}
