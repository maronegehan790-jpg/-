/**
 * T014 - Frontend authentication store.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md sections 1-5
 * Spec:     FR-004 (log in / log out), FR-006 (role drives which dashboard)
 * Constitution: Principle I (no `any`; `unknown` plus a type guard at every
 *           untrusted boundary — a response body is one), Principle V (callers
 *           get an actionable message, never a stack).
 *
 * This module is the other half of the split described in
 * `services/api.ts`: the client knows *how* to call the API, and this store
 * owns *where* the access token lives and who the current user is. It registers
 * itself with the client through `setAuthBridge`, so the dependency points one
 * way (store → client) and there is no import cycle.
 *
 * Two deliberate structural choices:
 *
 *   - A vanilla store with `useSyncExternalStore`, not a Context provider. The
 *     task names a `.ts` file, so it cannot hold JSX, and a provider would also
 *     mean the token's lifetime is tied to a mounted component tree. Non-React
 *     callers (the Socket.IO handshake, a route guard) can read `getAuthState()`
 *     directly.
 *   - The access token is held in a module variable that is NOT part of the
 *     published snapshot. It never enters React state, so it cannot be read out
 *     of a component tree by React DevTools, and a token refresh does not
 *     re-render every subscriber — nothing user-visible changed.
 */

import { useSyncExternalStore } from 'react';

import {
  api,
  clearAuthBridge,
  refreshAccessToken,
  setAuthBridge,
  toApiError,
  type ApiError,
} from '../services/api';

// --- Types -----------------------------------------------------------------

export type Role = 'ADMIN' | 'STUDENT';

/** The user shape the API returns; mirrors the backend's `PublicUser`. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Where the session is right now.
 *
 * `initializing` is distinct from `anonymous` on purpose: on a cold load we do
 * not yet know whether the refresh cookie will produce a session, and a router
 * that cannot tell the two apart will flash the login page at a signed-in user
 * before the refresh resolves. Guards should render a loading state for
 * `initializing` and only redirect on `anonymous`.
 */
export type AuthStatus = 'initializing' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

// --- Internal state --------------------------------------------------------

/**
 * The access token. In memory, for the lifetime of the page, and nowhere else.
 *
 * Never written to `localStorage` or `sessionStorage`: anything there is
 * readable by any script on the page, which is exactly the exposure the
 * HttpOnly refresh cookie exists to avoid. The cost is that a reload starts
 * with no token, which `initializeAuth` recovers from the cookie.
 */
let accessToken: string | null = null;

/**
 * The published snapshot.
 *
 * `useSyncExternalStore` compares snapshots by identity and will loop if
 * `getSnapshot` returns a fresh object each call, so this is replaced only when
 * something actually changed and handed out by reference otherwise.
 */
let state: AuthState = { status: 'initializing', user: null };

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: AuthState): void {
  if (next.status === state.status && next.user === state.user) {
    return;
  }
  state = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current state, for non-React callers (route guards, socket setup). */
export function getAuthState(): AuthState {
  return state;
}

/** Current access token, for callers that must attach it themselves. */
export function getAccessToken(): string | null {
  return accessToken;
}

// --- Response parsing ------------------------------------------------------

function isRole(value: unknown): value is Role {
  return value === 'ADMIN' || value === 'STUDENT';
}

/**
 * Narrow an unknown body to `AuthUser`.
 *
 * Returns null rather than throwing so each caller decides what a malformed
 * body means; a response that does not match the contract is treated as a
 * failed call, never coerced into a half-populated user.
 */
function parseUser(value: unknown): AuthUser | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { id, email, name, role } = record;

  if (
    typeof id !== 'string' ||
    typeof email !== 'string' ||
    typeof name !== 'string' ||
    !isRole(role)
  ) {
    return null;
  }
  return { id, email, name, role };
}

/** Narrow the `{ user, accessToken }` envelope returned by login and register. */
function parseSession(value: unknown): { user: AuthUser; accessToken: string } | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const user = parseUser(record.user);
  const token = record.accessToken;

  if (user === null || typeof token !== 'string' || token === '') {
    return null;
  }
  return { user, accessToken: token };
}

/** The error raised when the API answers 2xx with a body we cannot trust. */
function malformedResponse(): ApiError {
  return {
    status: 0,
    code: 'MALFORMED_RESPONSE',
    message: 'The server sent an unexpected response. Please try again.',
    details: [],
  };
}

// --- The Axios bridge ------------------------------------------------------

/**
 * Hand the client its three hooks into this store.
 *
 * Registered at module load, before any component mounts, so the very first
 * request already carries a token if one exists.
 *
 *   - `getAccessToken` is the synchronous read the request interceptor performs
 *     on every call.
 *   - `onTokenRefreshed` MUST store the new token. Without it the interceptor
 *     would keep re-reading the stale one and refresh on every request.
 *   - `onAuthExpired` fires when the refresh cookie is gone, expired, or was
 *     revoked (logout elsewhere, or a password reset). Clearing state here is
 *     what makes a server-side revocation visible in the UI.
 */
setAuthBridge({
  getAccessToken: () => accessToken,
  onTokenRefreshed: (token: string) => {
    accessToken = token;
  },
  onAuthExpired: () => {
    accessToken = null;
    setState({ status: 'anonymous', user: null });
  },
});

// --- Session initialization ------------------------------------------------

/**
 * In-flight initialization, shared by every caller.
 *
 * React 18 StrictMode mounts effects twice in development, so an unguarded
 * `useEffect(() => void initializeAuth())` would fire two refreshes and, once
 * refresh-token rotation lands, the second would present a token the first had
 * already rotated away.
 */
let inFlightInit: Promise<AuthState> | null = null;

/**
 * Restore a session on application startup.
 *
 * The access token is gone after a reload but the HttpOnly refresh cookie may
 * still be valid, so the cookie is the source of truth for "am I logged in".
 * `refreshAccessToken` never throws — a null result is the ordinary
 * not-signed-in case, not an error — so this resolves to a state rather than
 * rejecting, and callers need no try/catch.
 *
 * `/auth/me` is then called for the user, because the refresh endpoint returns
 * only a token (contract section 3). Its role is read from the database on the
 * server, so what lands here is current rather than whatever a stale token
 * claimed.
 */
export async function initializeAuth(): Promise<AuthState> {
  inFlightInit ??= (async (): Promise<AuthState> => {
    try {
      const token = await refreshAccessToken();
      if (token === null) {
        // No usable cookie. `onAuthExpired` has already set `anonymous`.
        setState({ status: 'anonymous', user: null });
        return state;
      }

      accessToken = token;

      const response = await api.get('/auth/me');
      const user = parseUser(response.data);
      if (user === null) {
        accessToken = null;
        setState({ status: 'anonymous', user: null });
        return state;
      }

      setState({ status: 'authenticated', user });
      return state;
    } catch {
      // A failed `/auth/me` after a successful refresh (offline, or a 401 the
      // interceptor could not repair) is treated as not-signed-in. Failing
      // closed is the right default: showing a signed-in shell with no usable
      // token would break on the first real request.
      accessToken = null;
      setState({ status: 'anonymous', user: null });
      return state;
    } finally {
      inFlightInit = null;
    }
  })();

  return inFlightInit;
}

// --- Actions ---------------------------------------------------------------

/**
 * Log in. Resolves to the user, or throws a normalised `ApiError`.
 *
 * Errors are deliberately re-thrown rather than parked in store state: the
 * failure belongs to the form that submitted it (Principle V requires the
 * message against the right field), and a store-level `error` would outlive the
 * form and leak into unrelated screens.
 *
 * The server sets the refresh cookie on this response; nothing here touches it.
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  try {
    const response = await api.post('/auth/login', { email, password });
    const session = parseSession(response.data);
    if (session === null) {
      throw malformedResponse();
    }

    accessToken = session.accessToken;
    setState({ status: 'authenticated', user: session.user });
    return session.user;
  } catch (error) {
    accessToken = null;
    setState({ status: 'anonymous', user: null });
    throw isApiError(error) ? error : toApiError(error);
  }
}

/**
 * Register a new Student account, which the API logs in immediately
 * (contract section 1 returns a user and an access token).
 *
 * No `role` argument exists, by design: FR-001 forbids a self-service path to
 * an Admin account, and the server hard-codes STUDENT regardless. Accepting a
 * role here would imply a capability the API does not offer.
 */
export async function register(email: string, password: string, name: string): Promise<AuthUser> {
  try {
    const response = await api.post('/auth/register', { email, password, name });
    const session = parseSession(response.data);
    if (session === null) {
      throw malformedResponse();
    }

    accessToken = session.accessToken;
    setState({ status: 'authenticated', user: session.user });
    return session.user;
  } catch (error) {
    accessToken = null;
    setState({ status: 'anonymous', user: null });
    throw isApiError(error) ? error : toApiError(error);
  }
}

/**
 * Log out: revoke the refresh token server-side, then clear local state.
 *
 * Local state is cleared in a `finally`, so a failed or unreachable request
 * still signs the user out of this tab. A logout that leaves someone apparently
 * signed in is the worse failure — particularly on a shared device. The
 * server-side revocation is the part that can be retried; the client-side
 * forget cannot be deferred.
 *
 * Never throws, so a logout button needs no error handling.
 */
export async function logout(): Promise<void> {
  try {
    // The interceptor attaches the Bearer token this endpoint requires, and the
    // browser sends the refresh cookie it revokes.
    await api.post('/auth/logout');
  } catch {
    // Already revoked, expired, or offline. Nothing actionable for the user.
  } finally {
    accessToken = null;
    setState({ status: 'anonymous', user: null });
  }
}

/** Type guard for the normalised error shape produced by `toApiError`. */
function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.status === 'number' &&
    typeof record.code === 'string' &&
    typeof record.message === 'string' &&
    Array.isArray(record.details)
  );
}

// --- React binding ---------------------------------------------------------

/**
 * Subscribe a component to auth state.
 *
 * `useSyncExternalStore` is the React 18 primitive for exactly this: it keeps
 * external state tear-free under concurrent rendering, which a
 * `useState` + `useEffect` pairing does not. The third argument (server
 * snapshot) is omitted — this app is a client-rendered SPA with no SSR pass.
 */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState);
}

/** Convenience selectors for guards and role-gated UI (FR-006). */
export function useIsAuthenticated(): boolean {
  return useAuth().status === 'authenticated';
}

export function useCurrentUser(): AuthUser | null {
  return useAuth().user;
}

/**
 * Reset the store to its initial state. Intended for test teardown.
 *
 * Also detaches the bridge, so a test that re-imports a fresh module graph does
 * not leave the previous instance's callbacks registered on the client.
 */
export function resetAuthStore(): void {
  accessToken = null;
  inFlightInit = null;
  state = { status: 'initializing', user: null };
  listeners.clear();
  clearAuthBridge();
}
