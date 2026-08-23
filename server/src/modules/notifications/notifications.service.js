import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/errors.js';

const PAGE_SIZE = 20;

export async function listFailed({ page }) {
  const where = { status: 'FAILED' };
  const [notifications, total] = await Promise.all([
    prisma.notificationOutbox.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notificationOutbox.count({ where }),
  ]);
  return { notifications, total, page, pageSize: PAGE_SIZE };
}

// Gives a FAILED row a clean fresh attempt rather than just nudging
// next_attempt_at — an admin retrying manually shouldn't have it die again
// after one try because it was already at maxAttempts.
export async function retryNotification(id) {
  const result = await prisma.notificationOutbox.updateMany({
    where: { id, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
  });
  if (result.count === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'No failed notification with that id.');
  }
  return prisma.notificationOutbox.findUnique({ where: { id } });
}
