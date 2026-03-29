import { Request, Response } from "express";
import { RolesService } from "../../services/admin/roles.service";
import { logger } from "../../logger";

export class RolesController {
  private rolesService = new RolesService();

  getAll = async (_req: Request, res: Response) => {
    try {
      const roles = await this.rolesService.getAll();
      return res.json(roles);
    } catch (err: any) {
      logger.error("GET /roles error:", err);
      return res.status(500).json({ error: err.message });
    }
  };
}
