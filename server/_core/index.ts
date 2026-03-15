import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sseHandler } from "../sse";
import { shutdownTelegram } from "../telegram";

// Reference to worker module (loaded dynamically in production)
let workerModule: { shutdownWorker: () => void } | null = null;

// ─── P1: Unified graceful shutdown coordinator ──────────────────────────────
// Single SIGTERM/SIGINT handler. Sequence:
//   1. Stop worker intervals (no new reconnects/syncs scheduled)
//   2. Disconnect all MTProto clients via telegram.ts (sets isShuttingDown flag)
//   3. Exit process
let isShuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] ━━━ ${signal} received ━━━`);
  console.log(`[Server] Step 1: Stopping worker intervals...`);
  try {
    workerModule?.shutdownWorker();
  } catch (err) {
    console.error("[Server] Error stopping worker:", err);
  }
  console.log(`[Server] Step 2: Disconnecting all Telegram clients...`);
  try {
    await shutdownTelegram();
  } catch (err) {
    console.error("[Server] Error during Telegram shutdown:", err);
  }
  console.log(`[Server] Step 3: Exiting process.`);
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

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
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const isApiRequest = req.path.startsWith("/api/");
      const isSlow = durationMs >= 5000;
      const isServerError = res.statusCode >= 500;
      if (!isApiRequest || (!isSlow && !isServerError)) return;

      const forwardedFor = req.headers["x-forwarded-for"];
      const requestId = req.headers["x-request-id"] ?? req.headers["x-render-request-id"] ?? "n/a";
      console.warn(
        `[HTTP] ${req.method} ${req.originalUrl} status=${res.statusCode} durationMs=${durationMs} ip=${req.ip} forwardedFor=${forwardedFor ?? "n/a"} requestId=${requestId}`
      );
    });
    next();
  });

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
  app.use("/api/trpc", apiLimiter);

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
    console.log("[Startup] Main server started. Starting Telegram Worker in-process...");
    // Start Worker in the same process to avoid AUTH_KEY_DUPLICATED on Render
    // (separate background workers get different IPs on each deploy)
    if (process.env.NODE_ENV !== "development") {
      import("../worker").then((mod) => {
        workerModule = mod;
        mod.startWorker().catch((err: any) => {
          console.error("[Worker] Failed to start:", err);
        });
      }).catch((err) => {
        console.error("[Worker] Failed to import worker module:", err);
      });
    }
  });
}

startServer().catch(console.error);
