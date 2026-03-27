import { Router } from "express";
import bcrypt from "bcrypt";
import { Employee } from "@scheduling-agent/database";
import { signToken, authMiddleware } from "../middleware/auth";

const router = Router();

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { empId, password } = req.body;

  if (!empId || !password) {
    return res.status(400).json({ error: "empId and password are required." });
  }

  try {
    const employee = await Employee.findByPk(empId);
    if (!employee || !employee.password) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const valid = await bcrypt.compare(password, employee.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = signToken({
      empId: employee.id,
      displayName: employee.displayName,
    });

    return res.json({
      token,
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        employeeIdentity: employee.employeeIdentity,
      },
    });
  } catch (err: any) {
    console.error("[auth] Login error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.user!.empId, {
      attributes: ["id", "displayName", "employeeIdentity"],
    });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }
    return res.json({
      id: employee.id,
      displayName: employee.displayName,
      employeeIdentity: employee.employeeIdentity,
    });
  } catch (err: any) {
    console.error("[auth] /me error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

export { router as authRouter };
