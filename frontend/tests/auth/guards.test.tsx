import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAuthState, resetAuthStore } from '../../src/store/authStore';
import { renderAt, setAnonymous, setSignedIn } from './harness';

describe('route guards', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetAuthStore();
  });

  describe('while the session is initializing', () => {
    it.each(['/dashboard', '/admin', '/login', '/register'])(
      'shows the loading screen on %s and does not redirect',
      (path) => {
        expect(getAuthState().status).toBe('initializing');
        renderAt(path);

        expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
        expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: /dashboard/ })).not.toBeInTheDocument();
      },
    );
  });

  describe('anonymous visitor', () => {
    it.each(['/dashboard', '/admin'])('is redirected from %s to /login', async (path) => {
      await setAnonymous();
      renderAt(path);

      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      expect(screen.queryByRole('heading', { name: /dashboard/ })).not.toBeInTheDocument();
    });
  });

  describe('Student', () => {
    it('sees access denied on /admin and the admin UI is never rendered', async () => {
      await setSignedIn('STUDENT');
      renderAt('/admin');

      expect(screen.getByRole('heading', { name: 'Access denied' })).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent(
        /^You do not have access to this page\.$/,
      );
      expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
      );
      expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument();
    });

    it('can open /dashboard', async () => {
      await setSignedIn('STUDENT');
      renderAt('/dashboard');

      expect(screen.getByRole('heading', { name: 'Student dashboard' })).toBeVisible();
    });

    it.each(['/login', '/register'])('is sent from %s to /dashboard', async (path) => {
      await setSignedIn('STUDENT');
      renderAt(path);

      expect(screen.getByRole('heading', { name: 'Student dashboard' })).toBeVisible();
    });
  });

  describe('Admin', () => {
    it('can open /admin', async () => {
      await setSignedIn('ADMIN');
      renderAt('/admin');

      expect(screen.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
      expect(screen.queryByRole('heading', { name: 'Access denied' })).not.toBeInTheDocument();
    });

    it.each(['/login', '/register'])('is sent from %s to /admin', async (path) => {
      await setSignedIn('ADMIN');
      renderAt(path);

      expect(screen.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    });
  });
});
