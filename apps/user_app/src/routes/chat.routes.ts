import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";
import { authMiddleware } from "../middlewares/auth";

const router = Router();
const chatController = new ChatController();

router.post("/", authMiddleware, chatController.send);

export { router as chatRouter };
