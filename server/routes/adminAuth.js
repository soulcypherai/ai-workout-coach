import express from "express";

import {
  generateAdminToken,
  validateAdminCredentials,
  verifyAdminToken,
} from "../middleware/adminAuth.js";

const router = express.Router();

// Admin login
router.post("/login", (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  if (!validateAdminCredentials(username, password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = generateAdminToken(username);

  // Set HTTP-only cookie for browser security
  res.cookie("adminToken", token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.json({
    success: true,
    token,
    admin: { username, role: "admin" },
  });
});

// Admin logout
router.post("/logout", (req, res) => {
  res.clearCookie("adminToken", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });
  res.json({ success: true, message: "Logged out successfully" });
});

// Verify admin session
router.get("/verify", verifyAdminToken, (req, res) => {
  res.json({
    authenticated: true,
    admin: {
      username: req.admin.username,
      role: req.admin.role,
    },
  });
});

export default router;
