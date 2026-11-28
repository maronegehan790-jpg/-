/**
 * T074 - Login screen.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md section 2
 * Spec:     FR-004 (log in), FR-006 (role drives which dashboard),
 *           FR-080 (inline, per-field validation; no submission while invalid),
 *           FR-083 (usable from 360px), FR-084 (contrast, visible focus,
 *           keyboard operability, labelled controls)
 * Constitution: Principle I (no `any`), Principle V (actionable messages, never
 *           a raw stack or internal detail).
 *
 * Follows the T060/T061 conventions: a `useRef` re-entry guard, `readOnly` plus
 * `aria-disabled` while sending rather than `disabled`, and focus moved to the
 * field or banner that carries the error.
 *
 * A 401 is deliberately shown as one message covering both an unknown email and
 * a wrong password. The API answers both identically so login cannot be used to
 * discover which addresses are registered, and this screen does not reintroduce
 * the distinction.
 */

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { roleHomePath } from '../../components/auth/roles';
import { isApiError, login } from '../../store/authStore';
import { validateEmail, validateLoginPassword } from './validation';

const FORGOT_PASSWORD_PATH = '/forgot-password';
const REGISTER_PATH = '/register';

/** Covers both an unknown email and a wrong password; see the file header. */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

/** Fixed wording for a 429, so the server's retry hint is never echoed. */
const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a while before trying again.';

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const LINK_CLASS =
  'rounded font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

function inputClass(invalid: boolean): string {
  return `mt-1 block w-full rounded-md border bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 read-only:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 ${
    invalid
      ? 'border-red-600 focus-visible:outline-red-600'
      : 'border-slate-300 focus-visible:outline-slate-900'
  }`;
}

function describedBy(...ids: (string | null)[]): string | undefined {
  const joined = ids.filter((id): id is string => id !== null).join(' ');
  return joined === '' ? undefined : joined;
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Per field: errors show only after blur or a submit attempt. */
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Synchronous re-entry guard, as in T060/T061: two clicks in the same frame
   * both read the pre-update `submitting`, so without this a double-click
   * sends two login attempts and spends two of the account's five.
   */
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const formErrorId = useId();

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setEmail(next);
    // Re-validate live only once an error has been shown, so an address is not
    // flagged while it is still being typed.
    if (emailTouched) {
      setEmailError(validateEmail(next));
    }
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setPassword(next);
    if (passwordTouched) {
      setPasswordError(validateLoginPassword(next));
    }
  }

  function handleEmailBlur() {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  }

  function handlePasswordBlur() {
    setPasswordTouched(true);
    setPasswordError(validateLoginPassword(password));
  }

  /** Move focus to the banner so a screen reader announces a 401 or 429. */
  function showFormError(message: string) {
    setFormError(message);
    // The banner is rendered by this same commit, so focus after paint.
    requestAnimationFrame(() => formErrorRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }

    setEmailTouched(true);
    setPasswordTouched(true);
    setFormError(null);
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateLoginPassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError !== null) {
      emailRef.current?.focus();
      return;
    }
    if (nextPasswordError !== null) {
      passwordRef.current?.focus();
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      // The password is sent as typed; only the email is trimmed, matching the
      // backend's `emailSchema.trim()` and `loginSchema`'s untrimmed password.
      const user = await login(email.trim(), password);
      // Replace, so Back does not return to a login form the user has passed.
      navigate(roleHomePath(user.role), { replace: true });
    } catch (cause: unknown) {
      // `cause` is never logged: an ApiError from the store is safe, but the
      // underlying AxiosError carries a request config holding the password.
      setSubmitting(false);
      setPassword('');
      setPasswordTouched(false);
      setPasswordError(null);

      if (!isApiError(cause)) {
        showFormError(GENERIC_ERROR_MESSAGE);
        return;
      }

      if (cause.status === 401 || cause.status === 400) {
        // A 400 means the server rejected a shape our own checks passed.
        // Reporting it as bad credentials keeps the server's developer-facing
        // wording off the screen.
        showFormError(INVALID_CREDENTIALS_MESSAGE);
      } else if (cause.status === 429) {
        showFormError(RATE_LIMITED_MESSAGE);
      } else if (cause.status === 0) {
        // Network, timeout, or a malformed 2xx body: all three carry a message
        // authored by the client, so it is safe to show.
        showFormError(cause.message);
      } else {
        showFormError(GENERIC_ERROR_MESSAGE);
      }
    } finally {
      inFlight.current = false;
    }
  }

  const showEmailError = emailTouched && emailError !== null;
  const showPasswordError = passwordTouched && passwordError !== null;
  const formErrorDescriptor = formError !== null ? formErrorId : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-2 text-slate-700">Welcome back. Enter your details to continue.</p>

        <form noValidate onSubmit={handleSubmit} aria-busy={submitting} className="mt-6">
          {formError !== null && (
            <div
              id={formErrorId}
              ref={formErrorRef}
              role="alert"
              tabIndex={-1}
              className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 focus:outline-none"
            >
              {formError}
            </div>
          )}

          <label htmlFor={emailId} className="block text-sm font-medium text-slate-900">
            Email address
          </label>
          <input
            ref={emailRef}
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            // Read-only rather than disabled while sending: a disabled control
            // drops keyboard focus to the document body.
            readOnly={submitting}
            aria-invalid={showEmailError}
            aria-describedby={describedBy(
              showEmailError ? emailErrorId : null,
              formErrorDescriptor,
            )}
            className={inputClass(showEmailError)}
            placeholder="name@example.com"
          />
          {showEmailError && (
            <p id={emailErrorId} className="mt-1 text-sm text-red-700">
              {emailError}
            </p>
          )}

          <label htmlFor={passwordId} className="mt-4 block text-sm font-medium text-slate-900">
            Password
          </label>
          <input
            ref={passwordRef}
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            readOnly={submitting}
            aria-invalid={showPasswordError}
            aria-describedby={describedBy(
              showPasswordError ? passwordErrorId : null,
              formErrorDescriptor,
            )}
            className={inputClass(showPasswordError)}
          />
          {showPasswordError && (
            <p id={passwordErrorId} className="mt-1 text-sm text-red-700">
              {passwordError}
            </p>
          )}

          <p className="mt-2 text-sm">
            <Link to={FORGOT_PASSWORD_PATH} className={LINK_CLASS}>
              Forgot your password?
            </Link>
          </p>

          {/*
           * `aria-disabled` rather than `disabled`, for the same focus reason
           * as the inputs. The `inFlight` guard is what blocks a second request.
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-700">
          New here?{' '}
          <Link to={REGISTER_PATH} className={LINK_CLASS}>
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
