// CRITICAL: Import instrument.js first, before any other imports
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { dirname } from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

// Database and migrations
import pool from "./db/index.js";
import { migrator } from "./db/migrate.js";
import "./instrument.js";
// Import Sentry from instrument file
import { Sentry } from "./instrument.js";
// Monitoring and logging
import { healthMonitor } from "./lib/alerting.js";
import { logger } from "./lib/cloudwatch-logger.js";
import { monitoring } from "./lib/monitoring.js";
import { systemMonitor } from "./lib/systemMonitor.js";
// LiveKit
import { generateLiveKitToken } from "./livekit/client.js";
// Middleware
import {
  errorHandler,
  notFoundHandler,
  setupProcessErrorHandlers,
  socketErrorHandler,
} from "./middleware/errorHandler.js";
import { createPerformanceMonitor } from "./middleware/performanceMonitor.js";
import { socketAuthMiddleware } from "./middleware/socketAuth.js";
import adminRouter from "./routes/admin.js";
import adminAuthRouter from "./routes/adminAuth.js";
import amazonPurchaseRouter from "./routes/amazon-purchase.js";
// Routes
import authRouter from "./routes/auth.js";
import creditsRouter from "./routes/credits.js";
import crossmintRouter from "./routes/crossmint.js";
import cryptoPaymentsRouter from "./routes/cryptoPayment.js";
import debugRouter from "./routes/debug.js";
import feedRouter from "./routes/feed.js";
import ipfsRouter from "./routes/ipfs.js";
import paymentsRouter from "./routes/payments.js";
import purchaseRouter from "./routes/purchase.js";
import recordingsRouter from "./routes/recordings.js";
import watermarkRouter from "./routes/watermark.js";
import { setupFeedNamespace } from "./sockets/feed.js";
// Socket namespaces
import { setupMediaNamespace } from "./sockets/media.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Sentry middleware (only if Sentry is initialized)
if (monitoring.isEnabled()) {
  // Sentry v9+ uses expressIntegration() which handles request/tracing automatically
  logger.info("Sentry middleware enabled", { component: "middleware" });
}

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// Stripe webhook endpoint needs raw body, so handle it before json parsing
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());
app.use(cookieParser());

// Performance monitoring (only in production)
if (process.env.NODE_ENV === "production") {
  app.use(
    createPerformanceMonitor({
      slowThreshold: 3000, // Log after 3s
      alertThreshold: 8000, // Alert after 8s
      excludePaths: ["/health", "/favicon.ico", "/api/livekit/token"],
    }),
  );
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// LiveKit token endpoint
app.post("/api/livekit/token", async (req, res) => {
  try {
    const { roomName, participantName } = req.body;

    if (!roomName || !participantName) {
      return res
        .status(400)
        .json({ error: "roomName and participantName are required" });
    }

    const token = await generateLiveKitToken(roomName, participantName);
    res.json({ token });
  } catch (error) {
    logger.error("Error generating LiveKit token", {
      error: error.message,
      component: "livekit",
    });
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Static file serving for uploads (development only)
if (process.env.NODE_ENV !== "production") {
  app.use("/uploads", express.static("uploads"));
}

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin", adminRouter);
app.use("/api/amazon", amazonPurchaseRouter);
app.use("/api/feed", feedRouter);
app.use("/api/credits", creditsRouter);
app.use("/api/crossmint", crossmintRouter);
app.use("/api/debug", debugRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/crypto-payments", cryptoPaymentsRouter);
app.use("/api/recordings", recordingsRouter);
app.use("/api/v1", purchaseRouter);
app.use("/api", watermarkRouter);
app.use("/api/ipfs", ipfsRouter);

// Setup Socket.IO namespaces with authentication
const mediaNamespace = io.of("/media");
const feedNamespace = io.of("/feed");

// Apply authentication middleware to namespaces
mediaNamespace.use(socketAuthMiddleware);
feedNamespace.use(socketAuthMiddleware);

// Setup namespace handlers
setupMediaNamespace(io);
setupFeedNamespace(io);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Sentry Express error handler (only if Sentry is initialized)
if (monitoring.isEnabled()) {
  Sentry.setupExpressErrorHandler(app);
}

// Custom error handler (must be after Sentry)
app.use(errorHandler);

// Setup process-level error handlers
setupProcessErrorHandlers();

// Optional: automatically run pending migrations before the server starts
try {
  const pending = await migrator.pending();
  if (pending.length > 0) {
    logger.info(`Applying ${pending.length} pending migration(s)`, {
      pendingCount: pending.length,
      component: "database",
    });
    await migrator.up();
    logger.info("Migrations applied successfully", { component: "database" });
  } else {
    logger.info("No pending migrations", { component: "database" });
  }
} catch (migrationError) {
  logger.error("Migration failed. Exiting...", {
    error: migrationError.message,
    component: "database",
  });
  process.exit(1);
}

const PORT = process.env.PORT || 3005;

// Start server
async function startServer() {
  try {
    server.listen(PORT, () => {
      logger.info(`Pitchroom server running on port ${PORT}`, {
        port: PORT,
        component: "server",
      });
      logger.info(
        `Allowed origin: ${process.env.FRONTEND_URL || "http://localhost:3004"}`,
        {
          origin: process.env.FRONTEND_URL || "http://localhost:3004",
          component: "server",
        },
      );
      logger.info("WebSocket ready for avatar chat connections", {
        component: "websocket",
      });

      // Start system monitoring only in production
      if (process.env.NODE_ENV === "production") {
        const monitoringInterval =
          parseInt(process.env.MONITORING_INTERVAL) || 60000; // Default 1 minute

        systemMonitor.startMonitoring((resources) => {
          // Log system info on first run
          if (!systemMonitor._loggedSystemInfo) {
            logger.info("System monitoring started", {
              systemInfo: systemMonitor.getSystemInfo(),
              component: "monitoring",
            });
            systemMonitor._loggedSystemInfo = true;
          }

          // Send resource data to health monitor for alerting
          healthMonitor.trackResourceUsage(resources);

          // Optional: Log high resource usage
          if (
            resources.memory > 80 ||
            resources.cpu > 80 ||
            resources.disk > 85
          ) {
            logger.warn("High resource usage detected", {
              memory: `${resources.memory}%`,
              cpu: `${resources.cpu}%`,
              disk: `${resources.disk}%`,
              component: "systemMonitor",
            });
          }
        }, monitoringInterval);

        logger.info(`System monitoring enabled`, {
          interval: monitoringInterval,
          component: "monitoring",
        });
      } else {
        logger.info("System monitoring disabled (development mode)", {
          component: "monitoring",
        });
      }
    });
  } catch (error) {
    logger.error("Failed to start server", {
      error: error.message,
      component: "startup",
    });
    process.exit(1);
  }
}

// Export app before starting server
export default app;

// Start the server
startServer();

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`, {
    signal,
    component: "shutdown",
  });

  // Close server to stop accepting new connections
  server.close(() => {
    logger.info("HTTP server closed", { component: "shutdown" });

    // Close database connections
    pool.end(() => {
      logger.info("Database connections closed", { component: "shutdown" });
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error("Graceful shutdown timeout, forcing exit", {
      component: "shutdown",
    });
    process.exit(1);
  }, 10000);
};

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
