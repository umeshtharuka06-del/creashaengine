import http from "http";
import { prisma } from "../lib/db";

// Tiny HTTP health server shared by all worker processes. Exposes GET /health
// returning 200 when the worker loop is running and the database answers a ping,
// 503 otherwise. Consumed by the Docker healthchecks in docker-compose.yml.

export interface WorkerState {
  name: string;
  running: boolean;
  startedAt: string;
  lastEventAt: string | null;
  processed: number;
  errors: number;
}

export function newState(name: string): WorkerState {
  return {
    name,
    running: true,
    startedAt: new Date().toISOString(),
    lastEventAt: null,
    processed: 0,
    errors: 0,
  };
}

export function startHealthServer(port: number, state: WorkerState) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url?.split("?")[0] === "/health") {
      let database = "disconnected";
      try {
        await prisma.$runCommandRaw({ ping: 1 });
        database = "connected";
      } catch {
        database = "disconnected";
      }
      const ok = state.running && database === "connected";
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: ok ? "ok" : "degraded", database, ...state }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
  server.listen(port, () => console.log(`[${state.name}] health listening on :${port}`));
  return server;
}
