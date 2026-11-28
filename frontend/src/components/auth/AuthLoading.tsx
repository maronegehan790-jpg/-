/**
 * The screen shown while `status` is `initializing` (T074).
 *
 * Both guards render this rather than deciding anything: on a cold load the
 * refresh cookie has not been exchanged yet, so neither "signed in" nor
 * "signed out" is known. Redirecting here is what would flash the login page
 * at an already-authenticated user (see the T014 note on `AuthStatus`).
 */

export default function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <p role="status" className="flex items-center gap-3 text-slate-700">
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent motion-reduce:animate-none"
        />
        Checking your session…
      </p>
    </main>
  );
}
