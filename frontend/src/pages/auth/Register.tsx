/**
 * T074 - Register screen.
 *
 * Contract: specs/001-zizo-lms/contracts/auth.md section 1
 * Spec:     FR-001 (no self-service path to an Admin account), FR-004,
 *           FR-006 (role drives which dashboard), FR-080 (inline, per-field
 *           validation), FR-083 (usable from 360px), FR-084 (contrast, visible
 *           focus, keyboard operability, labelled controls)
 * Constitution: Principle I (no `any`), Principle V (actionable messages, never
 *           a raw stack or internal detail).
 *
 * No `role` field exists on this form and none is sent. The store's `register`
 * takes no role argument and the server hard-codes STUDENT, which is the whole
 * of FR-001 (see the T014 note on `register`).
 *
 * The API registers and signs in with one call, so a success goes straight to
 * the new Student's dashboard rather than back to the login form.
 */

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { roleHomePath } from '../../components/auth/roles';
import { isApiError, register } from '../../store/authStore';
import { NAME_MAX_LENGTH, validateEmail, validateName, validateNewPassword } from './validation';

const LOGIN_PATH = '/login';

/**
 * Shown on the email field for a 409, not as a page-level banner: the address
 * is the thing the user has to change, so the message belongs beside it.
 */
const EMAIL_TAKEN_MESSAGE =
  'An account with that email already exists. Sign in instead, or use another email.';

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

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** Synchronous re-entry guard, as in T060/T061 and Login. */
  const inFlight = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const nameId = useId();
  const nameErrorId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const passwordErrorId = useId();
  const formErrorId = useId();

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setName(next);
    if (nameTouched) {
      setNameError(validateName(next));
    }
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setEmail(next);
    // Also clears a 409 set on this field: once the address changes, the
    // server's verdict about the old one no longer applies.
    if (emailTouched) {
      setEmailError(validateEmail(next));
    }
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setPassword(next);
    if (passwordTouched) {
      setPasswordError(validateNewPassword(next));
    }
  }

  function handleNameBlur() {
    setNameTouched(true);
    setNameError(validateName(name));
  }

  function handleEmailBlur() {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  }

  function handlePasswordBlur() {
    setPasswordTouched(true);
    setPasswordError(validateNewPassword(password));
  }

  /** Move focus to the banner so a screen reader announces a 429 or 5xx. */
  function showFormError(message: string) {
    setFormError(message);
    requestAnimationFrame(() => formErrorRef.current?.focus());
  }

  /** Put a server verdict on the email field and send focus there. */
  function showEmailFieldError(message: string) {
    setEmailTouched(true);
    setEmailError(message);
    emailRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }

    setNameTouched(true);
    setEmailTouched(true);
    setPasswordTouched(true);
    setFormError(null);
    const nextNameError = validateName(name);
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateNewPassword(password);
    setNameError(nextNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextNameError !== null) {
      nameRef.current?.focus();
      return;
    }
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
      // Name and email are trimmed to match `registerSchema`; the password is
      // sent exactly as typed, since the server does not trim it either.
      const user = await register(email.trim(), password, name.trim());
      navigate(roleHomePath(user.role), { replace: true });
    } catch (cause: unknown) {
      // `cause` is never logged: the underlying AxiosError holds a request
      // config containing the password.
      setSubmitting(false);

      if (!isApiError(cause)) {
        showFormError(GENERIC_ERROR_MESSAGE);
        return;
      }

      if (cause.status === 409) {
        showEmailFieldError(EMAIL_TAKEN_MESSAGE);
      } else if (cause.status === 400) {
        // Bind each field error the server reported, so a rule our checks do
        // not mirror still lands beside the right input. The server's own
        // wording is written for developers and is not shown.
        applyServerValidation(cause.details.map((detail) => detail.path));
      } else if (cause.status === 429) {
        showFormError(RATE_LIMITED_MESSAGE);
      } else if (cause.status === 0) {
        showFormError(cause.message);
      } else {
        showFormError(GENERIC_ERROR_MESSAGE);
      }
    } finally {
      inFlight.current = false;
    }
  }

  /** Map the 400 envelope's `details` paths onto this form's three fields. */
  function applyServerValidation(paths: string[]) {
    const onPassword = paths.includes('password');
    const onEmail = paths.includes('email');
    const onName = paths.includes('name');

    if (onName) {
      setNameError(`Enter a name of at most ${String(NAME_MAX_LENGTH)} characters.`);
    }
    if (onEmail) {
      setEmailError('Enter a valid email address, like name@example.com.');
    }
    if (onPassword) {
      setPasswordError(
        'This password does not meet the requirements. Check the rules below and try again.',
      );
    }
    if (!onName && !onEmail && !onPassword) {
      showFormError(GENERIC_ERROR_MESSAGE);
      return;
    }
    // Focus the first field carrying an error, top to bottom.
    if (onName) {
      nameRef.current?.focus();
    } else if (onEmail) {
      emailRef.current?.focus();
    } else {
      passwordRef.current?.focus();
    }
  }

  const showNameError = nameTouched && nameError !== null;
  const showEmailError = emailTouched && emailError !== null;
  const showPasswordError = passwordTouched && passwordError !== null;
  const formErrorDescriptor = formError !== null ? formErrorId : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-2 text-slate-700">Sign up to enrol in courses and watch your lessons.</p>

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

          <label htmlFor={nameId} className="block text-sm font-medium text-slate-900">
            Full name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            // Read-only rather than disabled while sending: a disabled control
            // drops keyboard focus to the document body.
            readOnly={submitting}
            aria-invalid={showNameError}
            aria-describedby={describedBy(showNameError ? nameErrorId : null, formErrorDescriptor)}
            className={inputClass(showNameError)}
          />
          {showNameError && (
            <p id={nameErrorId} className="mt-1 text-sm text-red-700">
              {nameError}
            </p>
          )}

          <label htmlFor={emailId} className="mt-4 block text-sm font-medium text-slate-900">
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
            autoComplete="new-password"
            required
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            readOnly={submitting}
            aria-invalid={showPasswordError}
            aria-describedby={describedBy(
              showPasswordError ? passwordErrorId : null,
              passwordHintId,
              formErrorDescriptor,
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
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-700">
          Already have an account?{' '}
          <Link to={LOGIN_PATH} className={LINK_CLASS}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
