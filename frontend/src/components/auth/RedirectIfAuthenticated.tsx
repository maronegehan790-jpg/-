/**
 * T074 - Keeps a signed-in user off `/login` and `/register`.
 *
 * Spec: FR-006 (role drives which dashboard).
 *
 * Same `initializing` rule as RequireAuth: render the loading screen, because
 * on a cold load we do not yet know whether there is a session to redirect.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useAuth } from '../../store/authStore';
import AuthLoading from './AuthLoading';
import { roleHomePath } from './roles';

export default function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();

  if (status === 'initializing') {
    return <AuthLoading />;
  }

  if (status === 'authenticated' && user !== null) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }

  return <>{children}</>;
}
