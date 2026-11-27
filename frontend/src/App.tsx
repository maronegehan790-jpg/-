import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import AuthLoading from './components/auth/AuthLoading';
import RedirectIfAuthenticated from './components/auth/RedirectIfAuthenticated';
import RequireAuth from './components/auth/RequireAuth';
import { roleHomePath } from './components/auth/roles';
import ForgotPassword from './pages/auth/ForgotPassword';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ResetPassword from './pages/auth/ResetPassword';
import { initializeAuth, logout, useAuth } from './store/authStore';

/**
 * Placeholder landing screens for the two roles (T074).
 *
 * The real dashboards are Phase 3 work. These exist so the guards and the
 * role-based redirects have something to resolve to, and so both roles can be
 * checked in a browser. The sign-out button is what makes switching roles
 * during that check possible.
 */
function RoleHome({ heading }: { heading: string }) {
  const { user } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
        {user !== null && (
          <p className="mt-3 text-slate-700">
            Signed in as {user.name} ({user.role})
          </p>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

/**
 * Catch-all destination, including `/`.
 *
 * Resolves by role so an Admin is not bounced through the Student dashboard,
 * where `RequireAuth` would be happy to render it. An anonymous visitor falls
 * through to `/dashboard`, whose guard sends them to `/login`.
 */
function RoleHomeRedirect() {
  const { status, user } = useAuth();

  if (status === 'initializing') {
    return <AuthLoading />;
  }
  return <Navigate to={user === null ? '/dashboard' : roleHomePath(user.role)} replace />;
}

export default function App() {
  /**
   * Restore a session from the HttpOnly refresh cookie once, on startup.
   *
   * Until this resolves the store reports `initializing` and the guards render
   * a loading screen, so a signed-in user reloading a protected route never
   * sees the login page flash. `initializeAuth` shares one in-flight promise,
   * so StrictMode's double effect in development still performs one refresh.
   */
  useEffect(() => {
    void initializeAuth();
  }, []);

  return (
    <Routes>
      {/* Paths must match the links in the reset email (`buildResetUrl`) and the pages. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* A signed-in user on these is sent to their own dashboard instead. */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <Login />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthenticated>
            <Register />
          </RedirectIfAuthenticated>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <RoleHome heading="Student dashboard" />
          </RequireAuth>
        }
      />
      {/*
       * Role-gated: a Student sees access denied and the admin subtree is never
       * mounted. The backend's 403 (T012) remains the authority.
       */}
      <Route
        path="/admin"
        element={
          <RequireAuth role="ADMIN">
            <RoleHome heading="Admin dashboard" />
          </RequireAuth>
        }
      />

      {/* Anything else, including `/`, lands on whichever home the role has. */}
      <Route path="*" element={<RoleHomeRedirect />} />
    </Routes>
  );
}
