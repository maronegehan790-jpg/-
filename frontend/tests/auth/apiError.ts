/**
 * Builds the AxiosError that a rejected request really produces, carrying the
 * backend's error envelope from `middleware/error.ts`.
 *
 * The page tests drive the actual auth store rather than a mock of it, so the
 * rejection has to survive the store's own `toApiError` normalisation. Handing
 * the store a bare `{ status }` object would skip that step and test nothing.
 */

import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

interface Detail {
  path: string;
  message: string;
}

export function axiosErrorWithStatus(
  status: number,
  code: string,
  message: string,
  details: Detail[] = [],
): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  return new AxiosError(
    message,
    `ERR_BAD_REQUEST_${String(status)}`,
    config,
    {},
    {
      status,
      statusText: '',
      data: { error: { code, message, details } },
      headers: new AxiosHeaders(),
      config,
    },
  );
}
