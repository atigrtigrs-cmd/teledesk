import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sseHandler } from "../sse";
import { restoreAllSessions, keepAliveAll } from "../telegram";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());
  // SSE real-time events endpoint
  app.get("/api/events", sseHandler);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Restore all active Telegram sessions after server is up
    // Skip in development to avoid AUTH_KEY_DUPLICATED conflicts with Render production
    if (process.env.NODE_ENV !== "development") {
      // Wait 60 seconds before connecting Telegram sessions.
      // Render keeps the old process alive for ~30-60s during deploys.
      // If we connect immediately, both old+new processes try to use the same session
      // which causes AUTH_KEY_DUPLICATED. Waiting ensures the old process is dead.
      console.log("[Startup] Waiting 60s before restoring Telegram sessions (Render deploy grace period)...");
      setTimeout(() => {
        restoreAllSessions().catch(err =>
          console.error("[Startup] Failed to restore Telegram sessions:", err)
        );
      }, 60000);

      // Keep-alive ping: every 3 minutes, send a lightweight getMe() to each active client
      // This prevents Render's idle connection timeout from dropping MTProto sessions
      setInterval(async () => {
        try {
          await keepAliveAll();
        } catch (err) {
          console.error("[KeepAlive] Ping failed:", err);
        }
      }, 3 * 60 * 1000);

      // Auto-reconnect watchdog: every 10 minutes, reconnect any disconnected accounts
      // Uses mutex so it won't run if restoreAllSessions is already running
      setInterval(async () => {
        try {
          console.log("[Watchdog] Checking Telegram account connections...");
          await restoreAllSessions();
        } catch (err) {
          console.error("[Watchdog] Auto-reconnect failed:", err);
        }
      }, 10 * 60 * 1000);
    } else {
      console.log("[Startup] Skipping Telegram session restore in development mode");
    }
  });
}

startServer().catch(console.error);
