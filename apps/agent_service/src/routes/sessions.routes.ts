import { Router } from "express";
import { SessionsController } from "../controllers/sessions.controller";

const router = Router();
const sessionsController = new SessionsController();

router.get("/:userId", sessionsController.getSessions);
router.post("/", sessionsController.createSession);

export { router as sessionsRouter };
