/**
 * Shared Prisma client.
 *
 * One client process-wide: Prisma owns a connection pool, so constructing a
 * client per service would multiply pools and exhaust PostgreSQL's connection
 * limit under load.
 *
 * No task owns this module; T010 is the first consumer that needs database
 * access, so the singleton lands here rather than being duplicated per service.
 */

import { PrismaClient } from '@prisma/client';

import { resolveDatabaseUrl } from '../config/env.js';

const datasourceUrl = resolveDatabaseUrl();

export const prisma = new PrismaClient({
  // Warnings and errors only. Query logging is deliberately off in every
  // environment: Prisma's query log includes parameter values, which on the
  // auth paths means emails and raw refresh tokens would land in stdout.
  log: ['warn', 'error'],
  ...(datasourceUrl === undefined ? {} : { datasourceUrl }),
});

/** Close the pool. Used by the server's shutdown path. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
