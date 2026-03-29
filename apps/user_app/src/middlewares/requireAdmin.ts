import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}
