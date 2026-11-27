import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/services/api';
import { resetAuthStore } from '../../src/store/authStore';
import { axiosErrorWithStatus } from './apiError';
import { renderAt, sessionResponse, setAnonymous } from './harness';

const EMAIL_TAKEN_MESSAGE =
  'An account with that email already exists. Sign in instead, or use another email.';

function fillAndSubmit(name: string, email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('Register page', () => {
  beforeEach(async () => {
    await setAnonymous();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetAuthStore();
  });

  describe('validation', () => {
    it('blocks an empty submit and reports every field', () => {
      const post = vi.spyOn(api, 'post');
      renderAt('/register');

      fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

      expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Enter your name.');
      expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
        'Enter your email address.',
      );
      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
        expect.stringContaining('Enter a password.'),
      );
      expect(screen.getByLabelText('Full name')).toHaveFocus();
      expect(post).not.toHaveBeenCalled();
    });

    it.each([
      ['Short1', 'Use at least 8 characters.'],
      [`Aa1${'x'.repeat(70)}`, 'Use at most 72 characters.'],
      ['PASSWORD1', 'Include at least one lower-case letter.'],
      ['password1', 'Include at least one upper-case letter.'],
      ['Passwordx', 'Include at least one digit.'],
    ])('rejects %j with "%s", mirroring passwordSchema', (password, message) => {
      const post = vi.spyOn(api, 'post');
      renderAt('/register');

      fillAndSubmit('Sam Student', 'student@example.com', password);

      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
        expect.stringContaining(message),
      );
      expect(screen.getByLabelText('Password')).toHaveFocus();
      expect(post).not.toHaveBeenCalled();
    });

    it('rejects a name longer than 100 characters', () => {
      renderAt('/register');

      fillAndSubmit('n'.repeat(101), 'student@example.com', 'Password1');

      expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription(
        'Use at most 100 characters.',
      );
    });
  });

  it('shows a 409 inline on the email field, not as a page banner', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      axiosErrorWithStatus(409, 'EMAIL_TAKEN', 'server wording for 409'),
    );
    renderAt('/register');

    fillAndSubmit('Sam Student', 'taken@example.com', 'Password1');

    const email = screen.getByLabelText('Email address');
    expect(await screen.findByText(EMAIL_TAKEN_MESSAGE)).toBeVisible();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(EMAIL_TAKEN_MESSAGE);
    expect(email).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('server wording for 409')).not.toBeInTheDocument();
  });

  it('sends name, email, and password only, with no role', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(sessionResponse('STUDENT'));
    renderAt('/register');

    fillAndSubmit('  Sam Student  ', '  student@example.com ', 'Password1');

    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeVisible();
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] ?? [];
    expect(url).toBe('/auth/register');
    expect(body).not.toHaveProperty('role');
    expect(Object.keys(body as object).sort()).toEqual(['email', 'name', 'password']);
    expect(body).toEqual({
      name: 'Sam Student',
      email: 'student@example.com',
      password: 'Password1',
    });
  });
});
