import { Router } from "express";
import { AgentsController } from "../../controllers/admin/agents.controller";

const router = Router();
const agentsController = new AgentsController();

router.get("/", agentsController.getAll);
router.post("/", agentsController.create);
router.patch("/:id", agentsController.update);

export { router as agentsRouter };
