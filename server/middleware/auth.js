import jwt from "jsonwebtoken";

import pool from "../db/index.js";
import { logger } from "../lib/cloudwatch-logger.js";
import { verifySupabaseToken } from "../lib/supabaseClient.js";

// JWT secret for MiniKit tokens
const MINIKIT_JWT_SECRET =
  process.env.MINIKIT_JWT_SECRET || process.env.JWT_SECRET || "your-secret-key";

// Shared JWT authentication middleware for HTTP routes - now uses Supabase JWT only
export const verifyJWTMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const minikitCookie = req.cookies?.minikit_token;

  // Determine authentication method based on token source
  let authMethod = null;
  let token = null;

  // Prioritize MiniKit cookie over Authorization header
  // This handles the case where Mini App sends both "Bearer cookie" and minikit_token cookie
  if (minikitCookie) {
    // MiniKit authentication takes priority
    authMethod = "minikit";
    token = minikitCookie;
    logger.debug("Using MiniKit authentication (cookie)", {
      hasAuthHeader: !!authHeader,
      component: "auth",
    });
  } else if (authHeader && authHeader.startsWith("Bearer ")) {
    // Token from Authorization header = Supabase authentication
    authMethod = "supabase";
    token = authHeader.split(" ")[1];
    logger.debug("Using Supabase authentication (header)", {
      component: "auth",
    });
  }

  if (!token || !authMethod) {
    logger.warn("No valid authentication token found", {
      hasAuthHeader: !!authHeader,
      hasMinikitCookie: !!minikitCookie,
      component: "auth",
    });
    return res.status(401).json({ error: "Authorization token is missing." });
  }

  try {
    if (authMethod === "minikit") {
      // MiniKit JWT token verification
      try {
        const decoded = jwt.verify(token, MINIKIT_JWT_SECRET);
        if (decoded.type === "minikit") {
          return await verifyMiniKitJWT(req, res, next, decoded);
        } else {
          return res.status(401).json({ error: "Invalid MiniKit token type." });
        }
      } catch (jwtError) {
        logger.error("MiniKit JWT verification failed", {
          error: jwtError.message,
          component: "auth",
        });
        return res.status(401).json({ error: "Invalid MiniKit token." });
      }
    } else if (authMethod === "supabase") {
      // Supabase token verification
      const supabaseUser = await verifySupabaseToken(token);
      if (!supabaseUser) {
        return res
          .status(401)
          .json({ error: "Invalid or expired Supabase token." });
      }

      // Find user in our database by supabase_user_id
      const result = await pool.query(
        'SELECT * FROM "User" WHERE supabase_user_id = $1',
        [supabaseUser.id],
      );

      if (result.rows.length > 0) {
        const dbUser = result.rows[0];
        req.user = {
          userId: dbUser.id,
          supabaseUserId: dbUser.supabase_user_id,
          role: dbUser.role,
          email: supabaseUser.email,
        };
        return next();
      } else {
        logger.warn(
          "Supabase user not found in database, user needs to complete registration",
          {
            supabaseUserId: supabaseUser.id,
            email: supabaseUser.email,
            component: "auth",
          },
        );
        return res.status(404).json({
          error: "User not found in database. Please complete registration.",
        });
      }
    }
  } catch (error) {
    logger.error("Token verification failed", {
      error: error.message,
      authMethod,
      component: "auth",
    });
    return res.status(403).json({ error: "Invalid or expired token." });
  }
};

// MiniKit JWT token verification
async function verifyMiniKitJWT(req, res, next, decoded) {
  try {
    // Check if token is expired
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return res.status(401).json({ error: "MiniKit token expired." });
    }

    // Find user in our database
    const result = await pool.query('SELECT * FROM "User" WHERE id = $1', [
      decoded.userId,
    ]);

    if (result.rows.length > 0) {
      const dbUser = result.rows[0];
      req.user = {
        userId: dbUser.id,
        supabaseUserId: dbUser.supabase_user_id,
        role: dbUser.role,
        email: dbUser.email,
        walletAddress: dbUser.wallet_address,
      };
      return next();
    } else {
      logger.warn("MiniKit user not found in database", {
        userId: decoded.userId,
        component: "auth",
      });
      return res.status(404).json({ error: "User not found in database." });
    }
  } catch (error) {
    logger.error("MiniKit JWT verification failed", {
      error: error.message,
      component: "auth",
    });
    return res.status(403).json({ error: "Invalid MiniKit token." });
  }
}

// Shared JWT authentication middleware for WebSocket connections - now uses Supabase JWT only
export const authenticateSocket = async (socket, next) => {
  try {
    let token = socket.handshake.auth.token;
    let authMethod = null;

    // If no token in auth, check cookies
    if (!token) {
      const cookies = socket.handshake.headers.cookie;
      if (cookies) {
        const minikitCookie = cookies
          .split(";")
          .find((c) => c.trim().startsWith("minikit_token="));
        if (minikitCookie) {
          token = minikitCookie.split("=")[1];
          authMethod = "minikit";
        }
      }
    } else {
      // Token in auth = Supabase authentication
      authMethod = "supabase";
    }

    if (!token || !authMethod) {
      return next(new Error("Authentication token required"));
    }

    if (authMethod === "minikit") {
      // MiniKit JWT token verification
      try {
        const decoded = jwt.verify(token, MINIKIT_JWT_SECRET);
        if (decoded.type === "minikit") {
          return await authenticateSocketWithMiniKitJWT(socket, next, decoded);
        } else {
          return next(new Error("Invalid MiniKit token type"));
        }
      } catch (jwtError) {
        return next(new Error("Invalid MiniKit token"));
      }
    } else if (authMethod === "supabase") {
      // Supabase token verification
      const supabaseUser = await verifySupabaseToken(token);
      if (!supabaseUser) {
        return next(new Error("Invalid Supabase authentication token"));
      }

      // Find user in our database by supabase_user_id
      const result = await pool.query(
        'SELECT * FROM "User" WHERE supabase_user_id = $1',
        [supabaseUser.id],
      );

      if (result.rows.length > 0) {
        const dbUser = result.rows[0];
        socket.userId = dbUser.id;
        socket.supabaseUserId = dbUser.supabase_user_id;
        next();
      } else {
        return next(new Error("User not found in database"));
      }
    }
  } catch (error) {
    next(new Error("Invalid authentication token"));
  }
};

// MiniKit JWT socket authentication
async function authenticateSocketWithMiniKitJWT(socket, next, decoded) {
  try {
    // Check if token is expired
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      return next(new Error("MiniKit token expired"));
    }

    // Find user in our database
    const result = await pool.query('SELECT * FROM "User" WHERE id = $1', [
      decoded.userId,
    ]);

    if (result.rows.length > 0) {
      const dbUser = result.rows[0];
      socket.userId = dbUser.id;
      socket.supabaseUserId = dbUser.supabase_user_id;
      socket.walletAddress = dbUser.wallet_address;
      next();
    } else {
      return next(new Error("User not found in database"));
    }
  } catch (error) {
    next(new Error("Invalid MiniKit token"));
  }
}
