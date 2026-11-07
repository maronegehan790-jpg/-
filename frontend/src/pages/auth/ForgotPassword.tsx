/**
 * T060 - Forgot Password screen.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md section 6
 * Spec:     Assumptions ("a password-reset flow (email-based) is in scope"),
 *           FR-080 (inline, per-field validation; no submission while invalid),
 *           FR-083 (usable from 360px), FR-084 (contrast, visible focus,
 *           keyboard operability, labelled controls)
 * Constitution: Principle I (no `any`), Principle V (actionable messages, never
 *           a raw stack or internal detail).
 *
 * The confirmation is the whole point of this screen being safe. The API
 * answers 202 with the same body for a registered and an unregistered address,
 * and this page renders a fixed client-side message on any 202 instead of
 * echoing the response. Nothing the user sees can differ between the two
 * cases, even if the server's wording later changes.
 *
 * Not mounted in a router: the app has no router yet, and T060 does not own
 * one. The login link is a plain anchor to `/login`, the path the routing task
 * is expected to serve.
 */

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';

import { api, toApiError } from '../../services/api';

/** Where "Back to sign in" points. */
const LOGIN_PATH = '/login';

/** Shown on every 202. Fixed here so it cannot vary with account existence. */
const CONFIRMATION_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Client-side shape check, mirroring the backend's `z.email()` closely enough
 * to catch typos before a round trip. It requires a dot in the domain, so
 * `missing@tld` is rejected here as it is by the API
 * (`passwordReset.test.ts:226`). The server remains the authority; this only
 * spares the user a request that would certainly fail.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'Enter your email address.';
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address, like name@example.com.';
  }
  return null;
}

type Status = 'idle' | 'submitting' | 'sent';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /**
   * Inline errors appear only after the user has left the field or tried to
   * submit. Validating from the first keystroke would flag an address as
   * invalid while it is still being typed.
   */
  const [touched, setTouched] = useState(false);

  /**
   * Synchronous re-entry guard. `status` alone is not enough: two clicks in the
   * same frame both read the pre-update state, so a double-click would send two
   * requests and spend two of the account's three hourly resets.
   */
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLHeadingElement>(null);

  const emailId = useId();
  const emailErrorId = useId();
  const formErrorId = useId();

  const submitting = status === 'submitting';

  /**
   * Move focus when the view swaps, so a screen reader announces the new state:
   * to the confirmation heading on success, back to the input on "start over".
   * Done after commit rather than inline in the handler, because the element
   * being focused does not exist until React has rendered it.
   */
  const previousStatus = useRef<Status>(status);
  useEffect(() => {
    if (status === 'sent') {
      confirmationRef.current?.focus();
    } else if (status === 'idle' && previousStatus.current === 'sent') {
      inputRef.current?.focus();
    }
    previousStatus.current = status;
  }, [status]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setEmail(next);
    // Re-validate live once an error has been shown, so it clears the moment
    // the address becomes valid instead of lingering until the next blur.
    if (touched) {
      setFieldError(validateEmail(next));
    }
  }

  function handleBlur() {
    setTouched(true);
    setFieldError(validateEmail(email));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }

    setTouched(true);
    setFormError(null);
    const error = validateEmail(email);
    setFieldError(error);
    if (error !== null) {
      inputRef.current?.focus();
      return;
    }

    inFlight.current = true;
    setStatus('submitting');
    try {
      // The response body is intentionally ignored; see CONFIRMATION_MESSAGE.
      await api.post('/auth/forgot-password', { email: email.trim() });
      setStatus('sent');
    } catch (cause: unknown) {
      const apiError = toApiError(cause);
      setStatus('idle');

      if (apiError.status === 400) {
        // The only field is the email, so any validation failure belongs to it.
        // The server's own wording is not shown: it is written for developers.
        setFieldError('Enter a valid email address, like name@example.com.');
        inputRef.current?.focus();
      } else if (apiError.status === 429) {
        setFormError('Too many reset requests. Please wait a while before trying again.');
      } else if (apiError.status === 0) {
        // Network or timeout: the message is authored by the client, not the
        // server, so it is safe to show as-is.
        setFormError(apiError.message);
      } else {
        // Anything else is deliberately flattened. A 5xx message, or any future
        // status, is not this screen's to interpret.
        setFormError(GENERIC_ERROR_MESSAGE);
      }
    } finally {
      inFlight.current = false;
    }
  }

  function handleStartOver() {
    setStatus('idle');
    setEmail('');
    setTouched(false);
    setFieldError(null);
    setFormError(null);
  }

  const showFieldError = touched && fieldError !== null;
  const describedBy = [
    showFieldError ? emailErrorId : null,
    formError !== null ? formErrorId : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ');

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {status === 'sent' ? (
          <section aria-labelledby="forgot-password-sent-heading">
            <h1
              id="forgot-password-sent-heading"
              ref={confirmationRef}
              tabIndex={-1}
              className="text-2xl font-bold text-slate-900 focus:outline-none"
            >
              Check your email
            </h1>
            <p role="status" className="mt-3 text-slate-700">
              {CONFIRMATION_MESSAGE}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              The link expires in 60 minutes. If nothing arrives, check your spam folder.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <a
                href={LOGIN_PATH}
                className="rounded font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Back to sign in
              </a>
              <button
                type="button"
                onClick={handleStartOver}
                className="rounded text-left text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Use a different email
              </button>
            </div>
          </section>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
            <p className="mt-2 text-slate-700">
              Enter the email you signed up with and we&apos;ll send you a link to reset it.
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

              <label htmlFor={emailId} className="block text-sm font-medium text-slate-900">
                Email address
              </label>
              <input
                ref={inputRef}
                id={emailId}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={handleChange}
                onBlur={handleBlur}
                // Read-only rather than disabled while sending: a disabled
                // control drops keyboard focus to the document body.
                readOnly={submitting}
                aria-invalid={showFieldError}
                aria-describedby={describedBy === '' ? undefined : describedBy}
                className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 read-only:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 ${
                  showFieldError
                    ? 'border-red-600 focus-visible:outline-red-600'
                    : 'border-slate-300 focus-visible:outline-slate-900'
                }`}
                placeholder="name@example.com"
              />
              {showFieldError && (
                <p id={emailErrorId} className="mt-1 text-sm text-red-700">
                  {fieldError}
                </p>
              )}

              {/*
               * `aria-disabled` rather than `disabled`, for the same focus
               * reason as the input. The `inFlight` guard in handleSubmit is
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
                {submitting ? 'Sending link…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-700">
              Remembered it?{' '}
              <a
                href={LOGIN_PATH}
                className="rounded font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Back to sign in
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
