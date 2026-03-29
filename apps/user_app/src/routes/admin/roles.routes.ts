import { Router } from "express";
import { RolesController } from "../../controllers/admin/roles.controller";

const router = Router();
const rolesController = new RolesController();

router.get("/", rolesController.getAll);

export { router as rolesRouter };
