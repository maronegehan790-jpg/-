/**
 * T074 - Route guard for authenticated and role-gated routes.
 *
 * Spec:     FR-004 (log in / log out), FR-006 (role drives which dashboard)
 * Constitution: Principle III — the backend is the authority on authorization.
 *
 * This guard only decides what to *render*. The API's own 401/403 (T012) stays
 * the gate; stopping the admin UI from mounting for a Student avoids a screen
 * whose every request would be refused, it does not grant or withhold access.
 */

import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router';

import { useAuth, type Role } from '../../store/authStore';
import AuthLoading from './AuthLoading';
import { LOGIN_PATH, roleHomePath } from './roles';

interface RequireAuthProps {
  children: ReactNode;
  /** When set, a signed-in user with a different role sees access denied. */
  role?: Role;
}

export default function RequireAuth({ children, role }: RequireAuthProps) {
  const { status, user } = useAuth();

  // `initializing` is a loading state, never a redirect. See AuthLoading.
  if (status === 'initializing') {
    return <AuthLoading />;
  }

  // `user === null` alongside `anonymous` is belt-and-braces: the two always
  // move together in the store, and the check is what narrows the type below.
  if (status === 'anonymous' || user === null) {
    return <Navigate to={LOGIN_PATH} replace />;
  }

  if (role !== undefined && user.role !== role) {
    return <AccessDenied homePath={roleHomePath(user.role)} />;
  }

  return <>{children}</>;
}

/**
 * Shown instead of the guarded subtree, so the UI the API would refuse is
 * never mounted. Not a redirect: silently moving the user somewhere else hides
 * the fact that the route exists but is not theirs.
 */
function AccessDenied({ homePath }: { homePath: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Access denied</h1>
        <p role="alert" className="mt-3 text-slate-700">
          You do not have access to this page.
        </p>
        <Link
          to={homePath}
          replace
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Go to your dashboard
        </Link>
      </div>
    </main>
  );
}
