import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Liveness/readiness probe for the web container (used by the Docker healthcheck
// and Nginx upstream checks). Returns 200 only when the database answers a ping.
export const dynamic = "force-dynamic";

export async function GET() {
  let database = "disconnected";
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    database = "connected";
  } catch {
    database = "disconnected";
  }
  const ok = database === "connected";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", service: "web", database },
    { status: ok ? 200 : 503 }
  );
}
