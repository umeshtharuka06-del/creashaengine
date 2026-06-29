import http from "http";
import { prisma } from "./db";
import { log } from "./logger";

export interface EngineState {
  running: boolean;
  lastTickAt: string | null;
  ticks: number;
}

/**
 * Tiny HTTP server exposing GET /health:
 *   { "status": "ok", "engine": "running", "database": "connected" }
 */
export function startHealthServer(port: number, state: EngineState) {
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
      const body = JSON.stringify({
        status: ok ? "ok" : "degraded",
        engine: state.running ? "running" : "stopped",
        database,
        lastTickAt: state.lastTickAt,
        ticks: state.ticks,
      });
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(port, () => log.engine("health.listening", { port }));
  return server;
}
