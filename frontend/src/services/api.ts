/**
 * T013 - Axios API client and authentication interceptors.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 2-5
 * Plan:     "Axios with interceptors for token refresh"
 * Constitution: Principle I (no `any`; `unknown` plus a type guard at every
 *           untrusted boundary — an HTTP response body is such a boundary),
 *           Principle V (errors surface an actionable message, not a stack),
 *           Principle VII (everything under `/api/v1/`).
 *
 * Division of responsibility with T014, which owns the auth store:
 *
 *   - This module knows *how* to talk to the API: base URL, credentials, the
 *     Bearer header, and the refresh dance on a 401.
 *   - It deliberately does NOT know *where* the access token lives. It holds no
 *     storage of its own and never touches `localStorage`. The store injects a
 *     reader and two callbacks via `setAuthBridge`; until it does, the client
 *     still works for unauthenticated calls.
 *
 * That split is what keeps the token out of persistent storage. A token in
 * `localStorage` is readable by any script on the page, which is precisely the
 * exposure the HttpOnly refresh cookie exists to avoid — persisting the access
 * token would undo it. The access token is expected to live in memory in the
 * store, and a page reload recovers a new one from the refresh cookie by
 * calling `refreshAccessToken` (see the T014 integration note below).
 */

import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

// --- Base configuration ----------------------------------------------------

/**
 * Read `VITE_API_URL` and fail loudly if it is missing.
 *
 * Vite inlines `import.meta.env` at build time, so an unset variable becomes
 * `undefined` and every request would silently resolve against the dev server's
 * own origin, producing confusing 404s from Vite instead of API errors. Better
 * to stop at module load with the name of the missing key.
 *
 * `.env.example` sets it to `http://localhost:5000/api/v1` — the version prefix
 * is part of the base URL, so request paths in this app are written without it
 * (`/auth/login`, not `/api/v1/auth/login`).
 */
function resolveBaseUrl(): string {
  const configured: unknown = import.meta.env.VITE_API_URL;
  if (typeof configured !== 'string' || configured.trim() === '') {
    throw new Error(
      'VITE_API_URL is not set. Copy frontend/.env.example to frontend/.env ' +
        '(expected e.g. http://localhost:5000/api/v1).',
    );
  }
  // Trailing slash removed so `${base}/auth/login` cannot become a double slash.
  return configured.trim().replace(/\/+$/, '');
}

export const API_BASE_URL = resolveBaseUrl();

/** Paths (relative to the base URL) that must never trigger a refresh attempt. */
const REFRESH_PATH = '/auth/refresh';

/**
 * Endpoints whose own 401 is a final answer rather than an expired token.
 *
 * A 401 from `/auth/login` means "wrong password" and a 401 from
 * `/auth/refresh` means "your session is over". Attempting a refresh for either
 * would be both pointless and, for refresh itself, directly recursive.
 */
const NO_REFRESH_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/register',
  REFRESH_PATH,
  '/auth/forgot-password',
  '/auth/reset-password',
];

/**
 * Shared Axios options.
 *
 * `withCredentials` is the load-bearing one: the refresh token is an HttpOnly
 * cookie, so it is attached by the browser and is invisible to this code. Axios
 * omits cookies on cross-origin requests unless this is set, which would make
 * `/auth/refresh` fail with a 401 for a user whose session is perfectly valid.
 *
 * Two deployment constraints follow from the cookie's attributes, both set by
 * T011 and neither fixable from here:
 *
 *   - `SameSite=Strict` means the frontend and the API must be same-site in
 *     production (e.g. `app.example.com` and `api.example.com`). Ports are not
 *     part of that comparison, so `localhost:5173` → `localhost:5000` is
 *     same-site and development works as-is.
 *   - `Secure` means HTTPS, with localhost exempted by Chrome and Firefox as a
 *     trustworthy origin. A LAN-IP dev host (`192.168.x.x`) is not exempt and
 *     will silently drop the cookie.
 */
const clientOptions = {
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { Accept: 'application/json' },
  // A bounded timeout: the spec targets Egyptian 3G conditions, where a hung
  // socket otherwise leaves a spinner up indefinitely (Principle V).
  timeout: 30_000,
} as const;

/** The client every feature module should import. */
export const api: AxiosInstance = axios.create(clientOptions);

/**
 * A second, interceptor-free instance used only to call `/auth/refresh`.
 *
 * Refreshing through `api` would re-enter the response interceptor when the
 * refresh itself returns 401, and the request interceptor would attach the very
 * access token that just expired. Keeping refresh on a bare instance makes that
 * recursion structurally impossible rather than something a guard has to catch.
 */
const refreshClient: AxiosInstance = axios.create(clientOptions);

// --- The T014 integration point --------------------------------------------

/**
 * What the auth store (T014) must supply.
 *
 * All three members are optional from this module's point of view: a client with
 * no bridge sends unauthenticated requests and performs no refresh, which is the
 * correct behaviour before the store mounts.
 */
export interface AuthBridge {
  /**
   * Current access token, or null when signed out.
   *
   * Called on every request, so it must be a cheap synchronous read of store
   * state — not a fetch, and not a promise.
   */
  getAccessToken?: () => string | null;

  /**
   * A refresh succeeded and produced a new access token.
   *
   * The store MUST persist this into its own state; otherwise every subsequent
   * request re-reads the stale token and refreshes again, turning one expiry
   * into a refresh per request.
   */
  onTokenRefreshed?: (accessToken: string) => void;

  /**
   * The session is unrecoverable: the refresh cookie is missing, expired, or was
   * revoked by logout or a password reset.
   *
   * The store should clear its state and send the user to the login route. This
   * module deliberately does not navigate — routing is not its concern.
   */
  onAuthExpired?: () => void;
}

let bridge: AuthBridge = {};

/**
 * Connect the auth store to this client. Call once, as the store initialises.
 *
 * Registration rather than an import of the store keeps the dependency pointing
 * one way (store → client). If this module imported the store, the store would
 * import the client to make its login call, and the resulting cycle breaks under
 * Vite's ESM graph in ways that surface as an undefined import at runtime.
 */
export function setAuthBridge(next: AuthBridge): void {
  bridge = next;
}

/** Drop the bridge. Intended for test teardown. */
export function clearAuthBridge(): void {
  bridge = {};
}

// --- Request interceptor: attach the access token --------------------------

/**
 * Attach `Authorization: Bearer <token>` when the store has one.
 *
 * Absent a token the header is simply omitted, so the request reaches the API
 * as anonymous and the server decides — the frontend never pre-empts an
 * authorization decision (Principle III: the UI may hide things, but it is not
 * the gate).
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = bridge.getAccessToken?.() ?? null;
  if (token !== null && token !== '') {
    // `config.headers` is an AxiosHeaders instance in Axios 1.x; `set` keeps
    // any per-request headers the caller already supplied.
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// --- Single-flight refresh -------------------------------------------------

/**
 * The in-flight refresh, shared by every request that hit a 401 at once.
 *
 * Without this, a dashboard firing five parallel requests on a stale token
 * produces five simultaneous calls to `/auth/refresh`. That is not merely
 * wasteful: each one is a separate credential check, and once T011 or a later
 * task adds refresh-token rotation, the first response invalidates the token the
 * other four are still presenting, so four of the five would fail and log the
 * user out mid-session. One shared promise means one refresh, five retries.
 */
let inFlightRefresh: Promise<string | null> | null = null;

/** Narrow an unknown response body to `{ accessToken: string }`. */
function readAccessToken(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const token = (data as Record<string, unknown>).accessToken;
  return typeof token === 'string' && token !== '' ? token : null;
}

/**
 * Exchange the refresh cookie for a new access token.
 *
 * Returns null — never throws — when the session cannot be recovered, so the
 * caller can fall through to rejecting the original request with its own error
 * rather than a confusing one about refreshing.
 *
 * Also exported for T014: on a cold page load the in-memory access token is
 * gone but the HttpOnly cookie may still be valid, so the store should call
 * this once at startup to restore the session. A null result means "show the
 * login page", not "something broke".
 */
export async function refreshAccessToken(): Promise<string | null> {
  inFlightRefresh ??= (async (): Promise<string | null> => {
    try {
      const response = await refreshClient.post(REFRESH_PATH);
      const token = readAccessToken(response.data);
      if (token === null) {
        bridge.onAuthExpired?.();
        return null;
      }
      bridge.onTokenRefreshed?.(token);
      return token;
    } catch {
      // A 401 here is the contract's "token expired or revoked" (section 3).
      // A network failure is indistinguishable from this vantage point and is
      // treated the same way: the session cannot be proven, so it ends.
      bridge.onAuthExpired?.();
      return null;
    } finally {
      // Cleared before the awaiting retries resume, so the *next* expiry starts
      // a fresh refresh instead of reusing this settled promise.
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

// --- Response interceptor: refresh once, then retry ------------------------

/** Our own marker, so one request can never be retried twice. */
interface RetryableConfig extends InternalAxiosRequestConfig {
  _authRetried?: boolean;
}

/** True when this path's 401 is final and must not trigger a refresh. */
function skipsRefresh(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  // Compare on the path only: `url` may be relative (`/auth/login`) or absolute
  // (when a caller passed a full URL), and a query string must not defeat the
  // match. The dummy base makes `URL` accept the relative form.
  const path = new URL(url, 'http://localhost').pathname.replace(/\/+$/, '');
  return NO_REFRESH_PATHS.some((candidate) => path.endsWith(candidate));
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError)) {
      throw error;
    }

    const config: RetryableConfig | undefined = error.config;
    const status = error.response?.status;

    // Not an auth problem, or no config to replay (a timeout or network error
    // has no response): nothing this interceptor can repair.
    if (status !== 401 || config === undefined) {
      throw error;
    }

    // The two loop guards. `_authRetried` bounds the chain at exactly one extra
    // attempt, so a token that is somehow rejected immediately after a
    // successful refresh fails cleanly instead of recursing; `skipsRefresh`
    // keeps the refresh and login endpoints out of the mechanism entirely.
    if (config._authRetried === true || skipsRefresh(config.url)) {
      throw error;
    }

    const token = await refreshAccessToken();
    if (token === null) {
      // Session over. `onAuthExpired` has already fired; surface the original
      // 401 so the calling component can render its error state.
      throw error;
    }

    config._authRetried = true;
    // Rebuild the header container: a config that has been through the adapter
    // once may carry a plain object here, which has no `.set`.
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('Authorization', `Bearer ${token}`);

    return api(config);
  },
);

// --- Error shaping ---------------------------------------------------------

/**
 * The backend's single error envelope, from `backend/src/middleware/error.ts`:
 *
 *   { "error": { "code": "...", "message": "...", "details"?: [...] } }
 */
export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  /** Per-field validation failures, for binding to form inputs (Principle V). */
  details: ApiErrorDetail[];
}

function readDetails(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): ApiErrorDetail[] => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    return typeof record.path === 'string' && typeof record.message === 'string'
      ? [{ path: record.path, message: record.message }]
      : [];
  });
}

/**
 * Normalise any thrown value into something a component can render.
 *
 * Every failure path produces the same shape, so UI code never has to branch on
 * whether it is holding an AxiosError, a network timeout, or an envelope from
 * the API. Principle V forbids surfacing a raw stack; this is the seam where
 * that is enforced on the client.
 */
export function toApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) {
    return {
      status: 0,
      code: 'UNKNOWN_ERROR',
      message: 'Something went wrong. Please try again.',
      details: [],
    };
  }

  const response = error.response;
  if (response === undefined) {
    // No response at all: DNS failure, offline, or the timeout above.
    return {
      status: 0,
      code: error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
      details: [],
    };
  }

  const body: unknown = response.data;
  const envelope =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).error : undefined;

  if (typeof envelope === 'object' && envelope !== null) {
    const record = envelope as Record<string, unknown>;
    return {
      status: response.status,
      code: typeof record.code === 'string' ? record.code : 'UNKNOWN_ERROR',
      message:
        typeof record.message === 'string'
          ? record.message
          : 'Something went wrong. Please try again.',
      details: readDetails(record.details),
    };
  }

  // A response that is not our envelope (a proxy error page, say).
  return {
    status: response.status,
    code: 'UNKNOWN_ERROR',
    message: 'Something went wrong. Please try again.',
    details: [],
  };
}

export default api;
