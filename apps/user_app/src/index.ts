import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import path from "path";
import { sequelize } from "@scheduling-agent/database";
import { authRouter } from "./routes/auth";
import { chatRouter } from "./routes/chat";
import { sessionsRouter } from "./routes/sessions";
import { notificationsRouter } from "./routes/notifications";
import { adminRouter } from "./routes/admin";
import { attachSocketIO } from "./sockets/server/socketServer";
import { connectToAgentService } from "./sockets/client/socketClient";
import { logger } from "./logger";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main(): Promise<void> {
  logger.info("Starting user_app…");

  await sequelize.authenticate();
  logger.info("Database connection OK");

  const app = express();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/admin", adminRouter);

  // In production, serve the React SPA from client/dist.
  const clientDist = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  // Express 5 / path-to-regexp v8 rejects bare "*"; use middleware for SPA fallback.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });

  const httpServer = createServer(app);
  attachSocketIO(httpServer);

  // Connect to agent_service socket for receiving chat replies
  connectToAgentService();

  httpServer.listen(PORT, () => {
    logger.info(`Listening on port ${PORT} (HTTP + Socket.IO)`);
  });
}

main().catch((err) => {
  logger.error("Fatal startup error", { error: String(err) });
  process.exit(1);
});
