import express from "express";
import cors from "cors";
import path from "path";
import { sequelize } from "@scheduling-agent/database";
import { authRouter } from "./routes/auth";
import { chatRouter } from "./routes/chat";
import { sessionsRouter } from "./routes/sessions";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main(): Promise<void> {
  console.log("[user_app] Starting…");

  await sequelize.authenticate();
  console.log("[user_app] Database connection OK.");

  const app = express();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/sessions", sessionsRouter);

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

  app.listen(PORT, () => {
    console.log(`[user_app] Listening on port ${PORT}.`);
  });
}

main().catch((err) => {
  console.error("[user_app] Fatal:", err);
  process.exit(1);
});
