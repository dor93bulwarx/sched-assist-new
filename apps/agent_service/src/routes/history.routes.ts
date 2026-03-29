import { Router } from "express";
import { HistoryController } from "../controllers/history.controller";

const router = Router();
const historyController = new HistoryController();

// Search must be before the generic :threadId route
router.get("/:threadId/search", historyController.search);
router.get("/:threadId", historyController.getHistory);

export { router as historyRouter };
