/**
 * Shared setup for the T074 page and guard tests.
 *
 * `renderAt` mounts the same guard arrangement as `App.tsx` inside a
 * MemoryRouter. `App` itself is not rendered because its startup effect calls
 * `initializeAuth`, which would send a real refresh request. The dashboards are
 * stand-in headings, so a test can tell which route it landed on.
 */

import { render } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';

import RedirectIfAuthenticated from '../../src/components/auth/RedirectIfAuthenticated';
import RequireAuth from '../../src/components/auth/RequireAuth';
import Login from '../../src/pages/auth/Login';
import Register from '../../src/pages/auth/Register';
import { api } from '../../src/services/api';
import { login, logout, type AuthUser, type Role } from '../../src/store/authStore';

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
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
              <h1>Student dashboard</h1>
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth role="ADMIN">
              <h1>Admin dashboard</h1>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

export function userWithRole(role: Role): AuthUser {
  return {
    id: role === 'ADMIN' ? 'admin-1' : 'student-1',
    email: role === 'ADMIN' ? 'admin@example.com' : 'student@example.com',
    name: role === 'ADMIN' ? 'Ada Admin' : 'Sam Student',
    role,
  };
}

export function okResponse(data: unknown): AxiosResponse {
  return { data, status: 200 } as AxiosResponse;
}

export function sessionResponse(role: Role): AxiosResponse {
  return okResponse({ user: userWithRole(role), accessToken: 'test-access-token' });
}

/** Moves the store out of `initializing` the way a real logout does. */
export async function setAnonymous(): Promise<void> {
  const post = vi.spyOn(api, 'post').mockResolvedValue(okResponse(null));
  await logout();
  post.mockRestore();
}

/** Signs in through the store's own `login`, so the state is one it can really reach. */
export async function setSignedIn(role: Role): Promise<void> {
  const post = vi.spyOn(api, 'post').mockResolvedValue(sessionResponse(role));
  await login(userWithRole(role).email, 'Password1');
  post.mockRestore();
}
