import { Router } from "express";
import { HistoryController } from "../controllers/history.controller";

const router = Router();
const historyController = new HistoryController();

// Conversation-scoped history (survives thread rotation)
router.get("/conversation/:conversationType/:conversationId", historyController.getConversationHistory);
// Thread-scoped routes (legacy / debug). Search must be before the generic :threadId route.
router.get("/:threadId/search", historyController.search);
router.get("/:threadId", historyController.getHistory);

export { router as historyRouter };
