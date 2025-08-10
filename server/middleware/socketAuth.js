import jwt from "jsonwebtoken";

import pool from "../db/index.js";
import { logger } from "../lib/cloudwatch-logger.js";
import { supabase, verifySupabaseToken } from "../lib/supabaseClient.js";
import { tokenCache } from "../lib/tokenCache.js";

const MINIKIT_JWT_SECRET =
  process.env.MINIKIT_JWT_SECRET || process.env.JWT_SECRET || "your-secret-key";

/**
 * Socket.IO authentication middleware
 * Validates tokens on connection and stores user info in socket
 * Supports both Supabase and MiniKit authentication
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    let authMethod = null;

    // If no token in auth, check cookies for MiniKit token
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

    if (!token) {
      logger.warn("[SocketAuth] No token provided", {
        socketId: socket.id,
        component: "socketAuth",
      });
      return next(new Error("Authentication required"));
    }

    // Check cache first for Supabase tokens
    if (authMethod === "supabase") {
      const cachedData = tokenCache.getUser(token);

      if (cachedData) {
        if (cachedData.invalid) {
          logger.debug("[SocketAuth] Cached invalid token", {
            socketId: socket.id,
            component: "socketAuth",
          });
          return next(new Error("TOKEN_EXPIRED"));
        }

        // Use cached user data
        socket.user = cachedData;
        logger.debug("[SocketAuth] Using cached user data", {
          userId: socket.user.id,
          socketId: socket.id,
          component: "socketAuth",
        });

        next();
        return;
      }
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
        logger.error("[SocketAuth] MiniKit JWT verification failed", {
          error: jwtError.message,
          socketId: socket.id,
          component: "socketAuth",
        });
        return next(new Error("Invalid MiniKit token"));
      }
    } else if (authMethod === "supabase") {
      // Supabase token verification
      try {
        const user = await verifySupabaseToken(token);

        if (!user) {
          logger.error("[SocketAuth] Token verification failed", {
            socketId: socket.id,
            component: "socketAuth",
          });

          // Mark token as invalid in cache
          tokenCache.setInvalid(token);

          return next(new Error("TOKEN_EXPIRED"));
        }

        // Get user details from database using supabase_user_id
        const result = await pool.query(
          'SELECT id, email, credits, supabase_user_id FROM "User" WHERE supabase_user_id = $1',
          [user.id],
        );

        if (result.rows.length === 0) {
          logger.error("[SocketAuth] User not found in database", {
            supabaseId: user.id,
            email: user.email,
            socketId: socket.id,
            component: "socketAuth",
          });

          // Mark token as invalid in cache
          tokenCache.setInvalid(token);

          return next(new Error("User not found"));
        }

        // Prepare user data
        const userData = {
          id: result.rows[0].id,
          email: result.rows[0].email,
          credits: result.rows[0].credits,
          supabaseUserId: result.rows[0].supabase_user_id,
        };

        // Cache the user data
        tokenCache.setUser(token, userData);

        // Attach user info to socket for use in event handlers
        socket.user = userData;

        logger.info("[SocketAuth] Socket authenticated with Supabase", {
          userId: socket.user.id,
          supabaseUserId: socket.user.supabaseUserId,
          email: socket.user.email,
          socketId: socket.id,
          component: "socketAuth",
        });

        next();
      } catch (verifyError) {
        logger.error("[SocketAuth] Token verification error", {
          error: verifyError.message,
          socketId: socket.id,
          component: "socketAuth",
        });

        // Mark token as invalid in cache
        tokenCache.setInvalid(token);

        return next(new Error("TOKEN_EXPIRED"));
      }
    }
  } catch (error) {
    logger.error("[SocketAuth] Middleware error", {
      error: error.message,
      socketId: socket.id,
      component: "socketAuth",
    });
    return next(new Error("Authentication failed"));
  }
};

// MiniKit JWT socket authentication
async function authenticateSocketWithMiniKitJWT(socket, next, decoded) {
  try {
    // Check if token is expired
    if (decoded.exp && Date.now() / 1000 > decoded.exp) {
      logger.error("[SocketAuth] MiniKit token expired", {
        socketId: socket.id,
        component: "socketAuth",
      });
      return next(new Error("MiniKit token expired"));
    }

    // Find user in our database
    const result = await pool.query(
      'SELECT id, email, credits, supabase_user_id, wallet_address FROM "User" WHERE id = $1',
      [decoded.userId],
    );

    if (result.rows.length > 0) {
      const dbUser = result.rows[0];

      // Prepare user data
      const userData = {
        id: dbUser.id,
        email: dbUser.email,
        credits: dbUser.credits,
        supabaseUserId: dbUser.supabase_user_id,
        walletAddress: dbUser.wallet_address,
      };

      // Attach user info to socket for use in event handlers
      socket.user = userData;

      logger.info("[SocketAuth] Socket authenticated with MiniKit", {
        userId: socket.user.id,
        walletAddress: socket.user.walletAddress,
        socketId: socket.id,
        component: "socketAuth",
      });

      next();
    } else {
      logger.error("[SocketAuth] MiniKit user not found in database", {
        userId: decoded.userId,
        socketId: socket.id,
        component: "socketAuth",
      });
      return next(new Error("User not found in database"));
    }
  } catch (error) {
    logger.error("[SocketAuth] MiniKit authentication error", {
      error: error.message,
      socketId: socket.id,
      component: "socketAuth",
    });
    return next(new Error("Invalid MiniKit token"));
  }
}

/**
 * Periodic token refresh check
 * Can be called periodically to validate socket connections
 */
export const validateSocketToken = async (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    socket.emit("auth_error", { error: "TOKEN_EXPIRED" });
    socket.disconnect(true);
    return false;
  }

  try {
    const user = await verifySupabaseToken(token);

    if (!user) {
      socket.emit("auth_error", { error: "TOKEN_EXPIRED" });
      socket.disconnect(true);
      return false;
    }

    return true;
  } catch (error) {
    socket.emit("auth_error", { error: "TOKEN_EXPIRED" });
    socket.disconnect(true);
    return false;
  }
};
