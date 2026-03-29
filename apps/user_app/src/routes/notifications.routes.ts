import { Router } from "express";
import { NotificationsController } from "../controllers/notifications.controller";
import { authMiddleware } from "../middlewares/auth";

const router = Router();
const notificationsController = new NotificationsController();

router.get("/unread", authMiddleware, notificationsController.getUnreadCounts);

export { router as notificationsRouter };
