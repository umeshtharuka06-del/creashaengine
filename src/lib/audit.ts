import { prisma } from "./db";

export async function audit(
  action: string,
  opts: { userId?: string | null; detail?: unknown; ip?: string | null } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: opts.userId ?? null,
        detail: opts.detail ? JSON.stringify(opts.detail) : null,
        ip: opts.ip ?? null,
      },
    });
  } catch {
    // Auditing must never break the main request path.
  }
}
