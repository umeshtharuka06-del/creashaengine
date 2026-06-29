import { prisma } from "@/lib/db";
import { ok } from "@/lib/http";

export async function GET() {
  const items = await prisma.announcement.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return ok(
    items.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}
