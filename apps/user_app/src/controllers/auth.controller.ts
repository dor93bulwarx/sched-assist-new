import { Request, Response } from "express";
import { loginSchema } from "@scheduling-agent/types";
import { AuthService } from "../services/auth.service";
import { logger } from "../logger";

export class AuthController {
  private authService = new AuthService();

  register = async (_req: Request, res: Response) => {
    return res.status(503).json({ error: "Registration not available — please try later." });
  };

  login = async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input.";
      return res.status(400).json({ error: firstError });
    }

    try {
      const result = await this.authService.login(parsed.data.userName, parsed.data.password);
      return res.json(result);
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error("Login error", { error: err?.message });
      return res.status(500).json({ error: "Internal server error." });
    }
  };

  me = async (req: Request, res: Response) => {
    try {
      const result = await this.authService.getMe(req.user!.userId);
      return res.json(result);
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      logger.error("/me error", { error: err?.message });
      return res.status(500).json({ error: "Internal server error." });
    }
  };
}
