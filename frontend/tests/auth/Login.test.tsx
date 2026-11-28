import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/services/api';
import { resetAuthStore } from '../../src/store/authStore';
import { axiosErrorWithStatus } from './apiError';
import { renderAt, sessionResponse, setAnonymous } from './harness';

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Login page', () => {
  beforeEach(async () => {
    await setAnonymous();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetAuthStore();
  });

  describe('validation', () => {
    it('blocks an empty submit and reports both fields', () => {
      const post = vi.spyOn(api, 'post');
      renderAt('/login');

      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
        'Enter your email address.',
      );
      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
      expect(screen.getByLabelText('Email address')).toHaveFocus();
      expect(post).not.toHaveBeenCalled();
    });

    it('flags a malformed email on blur, before any submit', () => {
      renderAt('/login');
      const email = screen.getByLabelText('Email address');

      fireEvent.change(email, { target: { value: 'not-an-email' } });
      expect(email).toHaveAttribute('aria-invalid', 'false');

      fireEvent.blur(email);
      expect(email).toHaveAttribute('aria-invalid', 'true');
      expect(email).toHaveAccessibleDescription(
        'Enter a valid email address, like name@example.com.',
      );
    });

    it('does not apply registration strength rules to the login password', async () => {
      const post = vi.spyOn(api, 'post').mockResolvedValue(sessionResponse('STUDENT'));
      renderAt('/login');

      fillAndSubmit('student@example.com', 'weak');

      expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeVisible();
      expect(post).toHaveBeenCalledWith('/auth/login', {
        email: 'student@example.com',
        password: 'weak',
      });
    });
  });

  describe('server errors', () => {
    it('shows the fixed invalid-credentials message for a 401', async () => {
      vi.spyOn(api, 'post').mockRejectedValue(
        axiosErrorWithStatus(401, 'INVALID_CREDENTIALS', 'server wording for 401'),
      );
      renderAt('/login');

      fillAndSubmit('student@example.com', 'Password1');

      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
      expect(screen.queryByText('server wording for 401')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toHaveValue('');
    });

    it('shows the fixed too-many-attempts message for a 429', async () => {
      vi.spyOn(api, 'post').mockRejectedValue(
        axiosErrorWithStatus(429, 'RATE_LIMITED', 'retry after 900 seconds'),
      );
      renderAt('/login');

      fillAndSubmit('student@example.com', 'Password1');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Too many attempts. Please wait a while before trying again.',
      );
      expect(screen.queryByText(/900 seconds/)).not.toBeInTheDocument();
    });
  });

  describe('role redirects', () => {
    it('sends a Student to /dashboard', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(sessionResponse('STUDENT'));
      renderAt('/login');

      fillAndSubmit('student@example.com', 'Password1');

      expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeVisible();
    });

    it('sends an Admin to /admin', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(sessionResponse('ADMIN'));
      renderAt('/login');

      fillAndSubmit('admin@example.com', 'Password1');

      expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
    });
  });
});
