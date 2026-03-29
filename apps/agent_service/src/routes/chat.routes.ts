import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";

const router = Router();
const chatController = new ChatController();

router.post("/", chatController.send);

export { router as chatRouter };
