/**
 * T061 - Reset Password screen.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md section 7
 * Spec:     Assumptions ("a password-reset flow (email-based) is in scope"),
 *           FR-004 (log in with the new password), FR-080 (inline, per-field
 *           validation; no submission while invalid), FR-083 (usable from
 *           360px), FR-084 (contrast, visible focus, keyboard operability,
 *           labelled controls)
 * Constitution: Principle I (no `any`), Principle V (actionable messages, never
 *           a raw stack or internal detail).
 *
 * Route: this screen must be served at `/reset-password`. The T057 mail builds
 * `${CLIENT_URL}/reset-password?token=<token>` (`buildResetUrl` in
 * `backend/src/services/email/emailSender.ts`). It is mounted at that path in
 * `App.tsx`.
 *
 * The token is a bearer credential for the account until it is spent, so it is
 * read from the URL once and then removed from the address bar (see
 * `stripTokenFromUrl`). It is never rendered, never logged, and leaves this
 * page only in the request body to the API.
 */

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { api, toApiError } from '../../services/api';

/** Query parameter the reset mail uses (`buildResetUrl`). */
const TOKEN_PARAM = 'token';

const LOGIN_PATH = '/login';
const FORGOT_PASSWORD_PATH = '/forgot-password';

/**
 * One message for an unknown, expired, already-used, or missing token.
 *
 * The API answers all three server-side cases with an identical 410 so token
 * state cannot be probed. This screen does not reintroduce the distinction,
 * and a link with no token at all is just another link that cannot work.
 */
const INVALID_LINK_MESSAGE =
  'This password reset link is invalid or has expired. Links work once and only for 60 minutes.';

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

// --- Token handling --------------------------------------------------------

/** The token from the current URL, or null when it is absent or empty. */
function readTokenFromUrl(): string | null {
  const value = new URLSearchParams(window.location.search).get(TOKEN_PARAM);
  // Not trimmed and not format-checked: the token is an exact credential, and
  // whether it is usable is the server's decision, reported as one 410.
  return value === null || value === '' ? null : value;
}

/**
 * Remove the token from the address bar without reloading.
 *
 * Left in place, the token would sit in browser history, be copied along with
 * the URL in any screenshot or share, and ride out in the `Referer` header of
 * the "Back to sign in" link. The cost is that reloading this page loses the
 * token; the remedy is to click the emailed link again, which still works
 * until it is used or expires.
 */
function stripTokenFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(TOKEN_PARAM)) {
    return;
  }
  url.searchParams.delete(TOKEN_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

// --- Validation ------------------------------------------------------------

/**
 * Mirrors the backend `passwordSchema` in `authController.ts`: 8-72
 * characters with a lower-case letter, an upper-case letter, and a digit. The
 * 72 cap is bcrypt's input limit. The server remains the authority; this only
 * spares the user a request that would certainly be rejected.
 *
 * Passwords are never trimmed. A leading or trailing space is part of the
 * password the user chose, and the server does not trim either.
 */
function validatePassword(value: string): string | null {
  if (value === '') {
    return 'Enter a new password.';
  }
  if (value.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (value.length > 72) {
    return 'Use at most 72 characters.';
  }
  if (!/[a-z]/.test(value)) {
    return 'Include at least one lower-case letter.';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Include at least one upper-case letter.';
  }
  if (!/[0-9]/.test(value)) {
    return 'Include at least one digit.';
  }
  return null;
}

function validateConfirm(password: string, confirm: string): string | null {
  if (confirm === '') {
    return 'Re-enter your new password.';
  }
  return confirm === password ? null : 'Passwords do not match.';
}

// --- Styling ---------------------------------------------------------------

const LINK_CLASS =
  'rounded font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

function inputClass(invalid: boolean): string {
  return `mt-1 block w-full rounded-md border bg-white px-3 py-2 text-slate-900 read-only:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 ${
    invalid
      ? 'border-red-600 focus-visible:outline-red-600'
      : 'border-slate-300 focus-visible:outline-slate-900'
  }`;
}

/** Join the ids of whichever descriptions are currently rendered. */
function describedBy(...ids: (string | null)[]): string | undefined {
  const joined = ids.filter((id): id is string => id !== null).join(' ');
  return joined === '' ? undefined : joined;
}

// --- Component -------------------------------------------------------------

type Status = 'idle' | 'submitting' | 'done' | 'invalid-link';

export default function ResetPassword() {
  // Read once, on first render. Kept in state rather than re-read from the URL,
  // because the effect below removes it from the URL straight after.
  const [token] = useState<string | null>(readTokenFromUrl);
  const [status, setStatus] = useState<Status>(() => (token === null ? 'invalid-link' : 'idle'));

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Per field: errors show only after blur or a submit attempt. */
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  /**
   * Synchronous re-entry guard, as in ForgotPassword: two clicks in one frame
   * both read the pre-update `status`, and each extra request spends one of
   * the token's five hourly attempts.
   */
  const inFlight = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const passwordId = useId();
  const passwordHintId = useId();
  const passwordErrorId = useId();
  const confirmId = useId();
  const confirmErrorId = useId();
  const formErrorId = useId();

  const submitting = status === 'submitting';

  useEffect(() => {
    stripTokenFromUrl();
  }, []);

  /**
   * Move focus to the result heading when the form is replaced, so a screen
   * reader announces the outcome. Only on a transition: an invalid link on
   * first load keeps the browser's normal initial focus.
   */
  const previousStatus = useRef<Status>(status);
  useEffect(() => {
    const changed = previousStatus.current !== status;
    previousStatus.current = status;
    if (changed && (status === 'done' || status === 'invalid-link')) {
      resultHeadingRef.current?.focus();
    }
  }, [status]);

  /** Drop both passwords from memory once they can no longer be submitted. */
  function clearPasswords() {
    setPassword('');
    setConfirm('');
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setPassword(next);
    if (passwordTouched) {
      setPasswordError(validatePassword(next));
    }
    // The confirmation's verdict depends on this field too.
    if (confirmTouched) {
      setConfirmError(validateConfirm(next, confirm));
    }
  }

  function handleConfirmChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setConfirm(next);
    if (confirmTouched) {
      setConfirmError(validateConfirm(password, next));
    }
  }

  function handlePasswordBlur() {
    setPasswordTouched(true);
    setPasswordError(validatePassword(password));
  }

  function handleConfirmBlur() {
    setConfirmTouched(true);
    setConfirmError(validateConfirm(password, confirm));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || token === null) {
      return;
    }

    setPasswordTouched(true);
    setConfirmTouched(true);
    setFormError(null);
    const nextPasswordError = validatePassword(password);
    const nextConfirmError = validateConfirm(password, confirm);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (nextPasswordError !== null) {
      passwordRef.current?.focus();
      return;
    }
    if (nextConfirmError !== null) {
      confirmRef.current?.focus();
      return;
    }

    inFlight.current = true;
    setStatus('submitting');
    try {
      await api.post('/auth/reset-password', { token, password });
      clearPasswords();
      setStatus('done');
    } catch (cause: unknown) {
      // `cause` is never logged: an AxiosError carries the request config,
      // whose body holds both the token and the new password.
      const apiError = toApiError(cause);

      if (apiError.status === 410) {
        clearPasswords();
        setStatus('invalid-link');
        return;
      }

      setStatus('idle');
      if (apiError.status === 400) {
        // A token the server will not even consider is still just a link that
        // does not work; anything else is the password. Server wording is not
        // shown, since it is written for developers.
        if (apiError.details.some((detail) => detail.path === 'token')) {
          clearPasswords();
          setStatus('invalid-link');
        } else {
          setPasswordError(
            'This password does not meet the requirements. Check the rules below and try again.',
          );
          passwordRef.current?.focus();
        }
      } else if (apiError.status === 429) {
        setFormError('Too many attempts. Please wait a while before trying again.');
      } else if (apiError.status === 0) {
        // Network or timeout: authored by the client, so safe to show.
        setFormError(apiError.message);
      } else {
        setFormError(GENERIC_ERROR_MESSAGE);
      }
    } finally {
      inFlight.current = false;
    }
  }

  const showPasswordError = passwordTouched && passwordError !== null;
  const showConfirmError = confirmTouched && confirmError !== null;
  const formErrorRef = formError !== null ? formErrorId : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {status === 'done' && (
          <section aria-labelledby="reset-password-done-heading">
            <h1
              id="reset-password-done-heading"
              ref={resultHeadingRef}
              tabIndex={-1}
              className="text-2xl font-bold text-slate-900 focus:outline-none"
            >
              Password updated
            </h1>
            <p role="status" className="mt-3 text-slate-700">
              Your password has been reset. Please sign in with your new password.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              For your security, you have been signed out on every device.
            </p>
            <a
              href={LOGIN_PATH}
              className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Sign in
            </a>
          </section>
        )}

        {status === 'invalid-link' && (
          <section aria-labelledby="reset-password-invalid-heading">
            <h1
              id="reset-password-invalid-heading"
              ref={resultHeadingRef}
              tabIndex={-1}
              className="text-2xl font-bold text-slate-900 focus:outline-none"
            >
              This link can&apos;t be used
            </h1>
            <p role="alert" className="mt-3 text-slate-700">
              {INVALID_LINK_MESSAGE}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <a
                href={FORGOT_PASSWORD_PATH}
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Request a new link
              </a>
              <a href={LOGIN_PATH} className={`${LINK_CLASS} text-center sm:text-left`}>
                Back to sign in
              </a>
            </div>
          </section>
        )}

        {(status === 'idle' || status === 'submitting') && (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
            <p className="mt-2 text-slate-700">
              Once it&apos;s changed, you&apos;ll be signed out everywhere and can sign in with the
              new password.
            </p>

            <form noValidate onSubmit={handleSubmit} aria-busy={submitting} className="mt-6">
              {formError !== null && (
                <div
                  id={formErrorId}
                  role="alert"
                  className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {formError}
                </div>
              )}

              <label htmlFor={passwordId} className="block text-sm font-medium text-slate-900">
                New password
              </label>
              <input
                ref={passwordRef}
                id={passwordId}
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={handlePasswordChange}
                onBlur={handlePasswordBlur}
                // Read-only rather than disabled while sending, so keyboard
                // focus is not dropped to the document body.
                readOnly={submitting}
                aria-invalid={showPasswordError}
                aria-describedby={describedBy(
                  showPasswordError ? passwordErrorId : null,
                  passwordHintId,
                  formErrorRef,
                )}
                className={inputClass(showPasswordError)}
              />
              {showPasswordError && (
                <p id={passwordErrorId} className="mt-1 text-sm text-red-700">
                  {passwordError}
                </p>
              )}
              <div id={passwordHintId} className="mt-2 text-sm text-slate-600">
                <p>Your password must have:</p>
                <ul className="mt-1 list-disc ps-5">
                  <li>8 to 72 characters</li>
                  <li>at least one lower-case and one upper-case letter</li>
                  <li>at least one digit</li>
                </ul>
              </div>

              <label htmlFor={confirmId} className="mt-4 block text-sm font-medium text-slate-900">
                Confirm new password
              </label>
              <input
                ref={confirmRef}
                id={confirmId}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={handleConfirmChange}
                onBlur={handleConfirmBlur}
                readOnly={submitting}
                aria-invalid={showConfirmError}
                aria-describedby={describedBy(
                  showConfirmError ? confirmErrorId : null,
                  formErrorRef,
                )}
                className={inputClass(showConfirmError)}
              />
              {showConfirmError && (
                <p id={confirmErrorId} className="mt-1 text-sm text-red-700">
                  {confirmError}
                </p>
              )}

              {/*
               * `aria-disabled` rather than `disabled`, for the same focus
               * reason as the inputs. The `inFlight` guard in handleSubmit is
               * what actually blocks a second request.
               */}
              <button
                type="submit"
                aria-disabled={submitting}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 aria-disabled:cursor-not-allowed aria-disabled:bg-slate-600"
              >
                {submitting && (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none"
                  />
                )}
                {submitting ? 'Updating password…' : 'Reset password'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-700">
              Remembered it?{' '}
              <a href={LOGIN_PATH} className={LINK_CLASS}>
                Back to sign in
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
