/**
 * Where each role lands after signing in (T074, FR-006).
 *
 * Shared by the guards and by the Login/Register pages so a role can never be
 * sent to one dashboard by the page and another by the guard wrapping it.
 */

import type { Role } from '../../store/authStore';

export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';

const ROLE_HOME: Record<Role, string> = {
  ADMIN: '/admin',
  STUDENT: '/dashboard',
};

/**
 * The role comes from the store's `/auth/me` or login result, which the server
 * reads from the database — never from a token claim decoded on the client.
 */
export function roleHomePath(role: Role): string {
  return ROLE_HOME[role];
}
