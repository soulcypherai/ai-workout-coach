import express from "express";
import multer from "multer";

import pool from "../db/index.js";
import { verifyAdminToken } from "../middleware/adminAuth.js";
import { creditsService } from "../services/creditsService.js";
import storageService from "../services/storage.js";

const router = express.Router();

// Protect all admin routes with authentication
router.use(verifyAdminToken);

// Multer setup for avatar image uploads (local development only)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size for images
  },
  fileFilter: (req, file, cb) => {
    console.log("[Admin] Upload file mimetype:", file.mimetype);
    if (
      file.mimetype.startsWith("image/jpeg") ||
      file.mimetype.startsWith("image/png") ||
      file.mimetype.startsWith("image/webp")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only JPEG, PNG, and WebP image files are allowed. Received: ${file.mimetype}`,
        ),
      );
    }
  },
});

// Multer setup for audio uploads (local development only)
const audioUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size for audio files
  },
  fileFilter: (req, file, cb) => {
    console.log("[Admin] Audio upload file mimetype:", file.mimetype);
    if (
      file.mimetype.startsWith("audio/mpeg") ||
      file.mimetype.startsWith("audio/mp3") ||
      file.mimetype.startsWith("audio/wav") ||
      file.mimetype.startsWith("audio/ogg") ||
      file.mimetype.startsWith("audio/m4a") ||
      file.mimetype.startsWith("audio/x-m4a")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only MP3, WAV, OGG, and M4A audio files are allowed. Received: ${file.mimetype}`,
        ),
      );
    }
  },
});

// Multer setup for 3D model uploads (local development only)
const modelUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size for 3D models
  },
  fileFilter: (req, file, cb) => {
    console.log("[Admin] Model upload file mimetype:", file.mimetype);
    const fileExtension = file.originalname.toLowerCase().split('.').pop();
    if (
      fileExtension === 'glb' ||
      fileExtension === 'gltf' ||
      file.mimetype === 'model/gltf+json' ||
      file.mimetype === 'model/gltf-binary' ||
      file.mimetype === 'application/octet-stream' // GLB files often have this mimetype
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only GLB and GLTF 3D model files are allowed. Received: ${file.mimetype}`,
        ),
      );
    }
  },
});

// Get all personas
router.get("/personas", async (req, res, next) => {
  const query = `
    SELECT 
      id, 
      slug,
      name, 
      system_prompt as "systemPrompt", 
      personality, 
      voice_id as "voiceId", 
      model_uri as "modelUri", 
      pricing_per_min as "pricingPerMin",
      description,
      x_url as "xUrl",
      image_url as "imageUrl",
      is_published,
      created_at as "createdAt",
      updated_at as "updatedAt",
      meta,
      category,
      preferred_genres as "preferredGenres",
      audio_references as "audioReferences",
      vision_enabled,
      vision_capture_interval,
      reference_outfits as "referenceOutfits"
    FROM "AvatarPersona" 
    ORDER BY is_published DESC, name ASC;
  `;

  const result = await pool.query(query);
  res.json(result.rows);
});

// Get a single persona
router.get("/personas/:id", async (req, res, next) => {
  const { id } = req.params;
  const query = `
    SELECT 
      id, 
      slug,
      name, 
      system_prompt as "systemPrompt", 
      personality, 
      voice_id as "voiceId", 
      model_uri as "modelUri", 
      pricing_per_min as "pricingPerMin",
      description,
      x_url as "xUrl",
      image_url as "imageUrl",
      is_published,
      created_at as "createdAt",
      updated_at as "updatedAt",
      meta,
      category,
      preferred_genres as "preferredGenres",
      audio_references as "audioReferences",
      vision_enabled,
      vision_capture_interval,
      reference_outfits as "referenceOutfits"
    FROM "AvatarPersona" 
    WHERE id = $1;
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Persona not found" });
  }

  res.json(result.rows[0]);
});

// Create a new persona
router.post("/personas", async (req, res, next) => {
  let {
    slug,
    name,
    systemPrompt,
    personality,
    voiceId,
    modelUri,
    pricingPerMin,
    description,
    xUrl,
    imageUrl,
    is_published,
    meta,
    category,
    preferredGenres,
    audioReferences,
    vision_enabled,
    vision_capture_interval,
    referenceOutfits,
  } = req.body;

  if (!name || !systemPrompt || !voiceId) {
    return res
      .status(400)
      .json({ error: "Name, systemPrompt, and voiceId are required" });
  }

  // Generate slug if not provided
  if (!slug) {
    let baseName = name.includes("-") ? name.split("-")[0] : name;
    baseName = baseName.trim();
    slug = baseName.replace(/\s+/g, "-").toLowerCase();
  }

  const query = `
  INSERT INTO "AvatarPersona" (
    slug,
    name,
    system_prompt,
    personality,
    voice_id,
    model_uri,
    pricing_per_min,
    description,
    x_url,
    image_url,
    is_published,
    meta,
    category,
    preferred_genres,
    audio_references,
    vision_enabled,
    vision_capture_interval,
    reference_outfits
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
    $11, $12, $13, $14, $15, $16, $17, $18
  )
  RETURNING 
    id, 
    slug,
    name, 
    system_prompt as "systemPrompt", 
    personality, 
    voice_id as "voiceId", 
    model_uri as "modelUri",
    pricing_per_min as "pricingPerMin",
    description,
    x_url as "xUrl",
    image_url as "imageUrl",
    is_published,
    created_at as "createdAt",
    updated_at as "updatedAt",
    meta,
    category,
    preferred_genres as "preferredGenres",
    audio_references as "audioReferences",
    vision_enabled,
    vision_capture_interval,
    reference_outfits as "referenceOutfits";
`;

  const result = await pool.query(query, [
    slug, // $1
    name, // $2
    systemPrompt, // $3
    personality || "{}", // $4
    voiceId, // $5
    modelUri || null, // $6
    pricingPerMin || 30, // $7
    description || null, // $8
    xUrl || null, // $9
    imageUrl || null, // $10
    is_published || false, // $11
    meta || "{}", // $12
    category || null, // $13
    Array.isArray(preferredGenres) ? preferredGenres : [], // $14
    Array.isArray(audioReferences) ? audioReferences : [], // $15
    vision_enabled || false, // $16
    vision_capture_interval || 5, // $17
    Array.isArray(referenceOutfits) ? JSON.stringify(referenceOutfits) : '[]', // $18
  ]);

  res.status(201).json(result.rows[0]);
});

// Update a persona
router.patch("/personas/:id", async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;

  // Build dynamic query for partial updates
  const updateFields = [];
  const values = [];
  let paramCount = 1;

  // Map of frontend field names to database column names
  const fieldMapping = {
    name: "name",
    systemPrompt: "system_prompt",
    personality: "personality",
    voiceId: "voice_id",
    modelUri: "model_uri",
    pricingPerMin: "pricing_per_min",
    description: "description",
    xUrl: "x_url",
    imageUrl: "image_url",
    is_published: "is_published",
    meta: "meta",
    category: "category",
    preferredGenres: "preferred_genres",
    audioReferences: "audio_references",
    vision_enabled: "vision_enabled",
    vision_capture_interval: "vision_capture_interval",
    referenceOutfits: "reference_outfits",
  };

  // Build SET clause dynamically
  for (const [frontendField, dbField] of Object.entries(fieldMapping)) {
    if (updates.hasOwnProperty(frontendField)) {
      updateFields.push(`${dbField} = $${paramCount}`);

      // Handle special cases for data transformation
      if (frontendField === "personality" || frontendField === "meta") {
        values.push(
          typeof updates[frontendField] === "string"
            ? updates[frontendField]
            : JSON.stringify(updates[frontendField]),
        );
      } else if (frontendField === "referenceOutfits") {
        // Handle reference outfits as JSONB
        values.push(
          Array.isArray(updates[frontendField])
            ? JSON.stringify(updates[frontendField])
            : '[]'
        );
      } else {
        if (
          frontendField === "preferredGenres" ||
          frontendField === "audioReferences"
        ) {
          values.push(
            Array.isArray(updates[frontendField]) ? updates[frontendField] : [],
          );
        } else {
          values.push(updates[frontendField]);
        }
      }
      paramCount++;
    }
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  // Always update the timestamp
  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
      UPDATE "AvatarPersona" 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING 
        id, 
        slug,
        name, 
        system_prompt as "systemPrompt", 
        personality, 
        voice_id as "voiceId", 
        model_uri as "modelUri",
        pricing_per_min as "pricingPerMin",
        description,
        x_url as "xUrl",
        image_url as "imageUrl",
        is_published,
        created_at as "createdAt",
        updated_at as "updatedAt",
        meta,
        category,
        preferred_genres as "preferredGenres",
        audio_references as "audioReferences",
        vision_enabled,
        vision_capture_interval;
    `;

  values.push(id);
  const result = await pool.query(query, values);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Persona not found" });
  }

  res.json(result.rows[0]);
});

// Delete a persona
router.delete("/personas/:id", async (req, res, next) => {
  const { id } = req.params;

  const query = 'DELETE FROM "AvatarPersona" WHERE id = $1 RETURNING id;';
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Persona not found" });
  }

  res.json({ message: "Persona deleted successfully", id });
});

// Admin Community Feed Management - Delete Operations Only
// (Use existing /api/feed endpoints for reading data)

// Hide a community post (admin soft delete)
router.delete("/community/posts/:postId", async (req, res, next) => {
  const { postId } = req.params;

  // Soft delete - mark post as hidden instead of deleting
  const query =
    'UPDATE "CommunityPost" SET hidden = TRUE WHERE id = $1 RETURNING id, video_url, hidden;';
  const result = await pool.query(query, [postId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Post not found" });
  }

  res.json({
    message: "Post hidden successfully",
    postId,
    videoUrl: result.rows[0].video_url,
    hidden: result.rows[0].hidden,
  });
});

// Restore a hidden community post (admin)
router.patch("/community/posts/:postId/restore", async (req, res, next) => {
  const { postId } = req.params;

  // Restore post - mark as not hidden
  const query =
    'UPDATE "CommunityPost" SET hidden = FALSE WHERE id = $1 RETURNING id, video_url, hidden;';
  const result = await pool.query(query, [postId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Post not found" });
  }

  res.json({
    message: "Post restored successfully",
    postId,
    videoUrl: result.rows[0].video_url,
    hidden: result.rows[0].hidden,
  });
});

// Delete a comment (admin)
router.delete("/community/comments/:commentId", async (req, res, next) => {
  const { commentId } = req.params;

  const query =
    'DELETE FROM "CommunityComment" WHERE id = $1 RETURNING id, post_id;';
  const result = await pool.query(query, [commentId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Comment not found" });
  }

  res.json({
    message: "Comment deleted successfully",
    commentId,
    postId: result.rows[0].post_id,
  });
});

/**
 * POST /api/admin/avatar-image-upload-url
 * Generate a pre-signed URL for avatar image upload
 */
router.post("/avatar-image-upload-url", async (req, res, next) => {
  const { fileExtension } = req.body;

  if (!fileExtension) {
    return res.status(400).json({ error: "File extension is required" });
  }

  // Generate unique key for avatar images
  const timestamp = Date.now();
  const key = `avatars/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

  // Get signed URL from storage service
  const { uploadUrl, publicUrl } =
    await storageService.generateAvatarImageUploadUrl("admin", fileExtension);

  res.json({ uploadUrl, publicUrl });
});

/**
 * POST /api/admin/upload-avatar-image/:key (for local development only)
 * Direct file upload endpoint for local development
 */
router.post(
  "/upload-avatar-image/:key",
  (req, res, next) => {
    // Dynamically choose multer middleware based on file extension
    const key = decodeURIComponent(req.params.key);
    const fileExtension = key.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'glb' || fileExtension === 'gltf') {
      return modelUpload.single("image")(req, res, next);
    } else {
      return upload.single("image")(req, res, next);
    }
  },
  async (req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      return res
        .status(404)
        .json({ error: "This endpoint is only available in development" });
    }

    const key = decodeURIComponent(req.params.key);

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    console.log("[Admin] Received avatar image file:", {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.buffer ? req.file.buffer.length : 0,
      key: key,
    });

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: "Image file is empty" });
    }

    // Save file locally
    await storageService.saveFileLocally(key, req.file.buffer);

    res.json({
      message: "Avatar image uploaded successfully",
      key,
      publicUrl: storageService.getPublicUrl(key),
    });
  },
);


// ==============================================================================
// CREDIT MANAGEMENT ROUTES
// ==============================================================================

// Get all users with their credit balances
router.get("/users/credits", async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const search = req.query.search || "";
  const offset = (page - 1) * limit;

  let query = `
      SELECT 
        u.id,
        u.wallet_address,
        u.email,
        u.credits,
        u.created_at,
        u.updated_at,
        u.meta,
        COUNT(cs.id) as total_sessions,
        COALESCE(SUM(cs.credits_spent), 0) as total_credits_spent
      FROM "User" u
      LEFT JOIN "CallSession" cs ON u.id = cs.user_id
    `;

  const queryParams = [];
  let paramCount = 1;

  if (search) {
    query += ` WHERE (u.wallet_address ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
    queryParams.push(`%${search}%`);
    paramCount++;
  }

  query += ` 
      GROUP BY u.id, u.wallet_address, u.email, u.credits, u.created_at, u.updated_at, u.meta
      ORDER BY u.created_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

  queryParams.push(limit, offset);

  const result = await pool.query(query, queryParams);

  // Get total count for pagination
  let countQuery = 'SELECT COUNT(*) FROM "User" u';
  const countParams = [];

  if (search) {
    countQuery += " WHERE (u.wallet_address ILIKE $1 OR u.email ILIKE $1)";
    countParams.push(`%${search}%`);
  }

  const countResult = await pool.query(countQuery, countParams);
  const totalUsers = parseInt(countResult.rows[0].count);

  res.json({
    users: result.rows,
    pagination: {
      page,
      limit,
      total: totalUsers,
      pages: Math.ceil(totalUsers / limit),
    },
  });
});

// Get credit transaction history for a user
router.get("/users/:userId/credits/history", async (req, res, next) => {
  const { userId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  const transactions = await creditsService.getCreditHistory(userId, limit);
  res.json({ transactions });
});

// Manually adjust user credits (admin only)
router.post("/users/:userId/credits/adjust", async (req, res, next) => {
  const { userId } = req.params;
  const { amount, description, type = "admin_adjustment" } = req.body;

  if (!amount || typeof amount !== "number") {
    return res.status(400).json({ error: "Valid amount is required" });
  }

  if (!description) {
    return res
      .status(400)
      .json({ error: "Description is required for admin adjustments" });
  }

  let newBalance;
  const adminDescription = `Admin: ${description}`;

  if (amount > 0) {
    // Adding credits
    newBalance = await creditsService.addCredits(
      userId,
      amount,
      adminDescription,
      null,
    );
  } else {
    // Removing credits (amount is negative)
    newBalance = await creditsService.spendCredits(
      userId,
      Math.abs(amount),
      adminDescription,
      null,
      null,
    );
  }

  res.json({
    message: "Credits adjusted successfully",
    userId,
    amount,
    newBalance,
    description: adminDescription,
  });
});

// Get credit system statistics
router.get("/credits/stats", async (req, res, next) => {
  // Separate queries to avoid Cartesian product issues
  const userStatsQuery = `
      SELECT 
        COUNT(*) as total_users,
        SUM(credits) as total_credits_in_system,
        AVG(credits) as avg_credits_per_user
      FROM "User"
    `;

  const sessionStatsQuery = `
      SELECT 
        COUNT(*) as total_sessions,
        COALESCE(SUM(credits_spent), 0) as total_credits_spent
      FROM "CallSession"
    `;

  const transactionStatsQuery = `
      SELECT COUNT(*) as total_transactions
      FROM "CreditTransaction"
    `;

  const transactionTypesQuery = `
      SELECT 
        type,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM "CreditTransaction"
      GROUP BY type
      ORDER BY count DESC
    `;

  const recentActivityQuery = `
      SELECT 
        DATE(created_at) as date,
        type,
        COUNT(*) as transaction_count,
        SUM(ABS(amount)) as total_credits
      FROM "CreditTransaction"
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), type
      ORDER BY date DESC, type
      LIMIT 50
    `;

  const [
    userResult,
    sessionResult,
    transactionResult,
    typesResult,
    activityResult,
  ] = await Promise.all([
    pool.query(userStatsQuery),
    pool.query(sessionStatsQuery),
    pool.query(transactionStatsQuery),
    pool.query(transactionTypesQuery),
    pool.query(recentActivityQuery),
  ]);

  // Combine results
  const overview = {
    ...userResult.rows[0],
    ...sessionResult.rows[0],
    ...transactionResult.rows[0],
  };

  res.json({
    overview,
    transactionTypes: typesResult.rows,
    recentActivity: activityResult.rows,
  });
});

// Get credit pricing settings
router.get("/settings/pricing", async (req, res, next) => {
  const settingsQuery = `
      SELECT setting_key, setting_value, setting_type
      FROM "SystemSettings"
      WHERE setting_key IN ('credits_usd_price', 'credits_min_purchase', 'credits_max_purchase')
      ORDER BY setting_key
    `;

  const result = await pool.query(settingsQuery);

  // Transform into simplified format
  const settings = {
    credit_price: 0.1,
    min_purchase: 10,
    max_purchase: 1000,
  };

  result.rows.forEach((row) => {
    let value = row.setting_value;

    // Parse value based on type
    if (row.setting_type === "number") {
      value = parseFloat(value);
    }

    if (row.setting_key === "credits_usd_price") {
      settings.credit_price = value;
    } else if (row.setting_key === "credits_min_purchase") {
      settings.min_purchase = value;
    } else if (row.setting_key === "credits_max_purchase") {
      settings.max_purchase = value;
    }
  });

  res.json(settings);
});

// Update credit pricing settings
router.put("/settings/pricing", async (req, res, next) => {
  const { credit_price, min_purchase, max_purchase } = req.body;

  // Validate inputs
  if (typeof credit_price !== "number" || credit_price <= 0) {
    return res
      .status(400)
      .json({ error: "credit_price must be a positive number" });
  }

  if (typeof min_purchase !== "number" || min_purchase <= 0) {
    return res
      .status(400)
      .json({ error: "min_purchase must be a positive number" });
  }

  if (typeof max_purchase !== "number" || max_purchase <= 0) {
    return res
      .status(400)
      .json({ error: "max_purchase must be a positive number" });
  }

  if (min_purchase > max_purchase) {
    return res
      .status(400)
      .json({ error: "min_purchase cannot be greater than max_purchase" });
  }

  // Update settings in database
  const updates = [
    pool.query(
      'UPDATE "SystemSettings" SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $2',
      [credit_price.toString(), "credits_usd_price"],
    ),
    pool.query(
      'UPDATE "SystemSettings" SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $2',
      [min_purchase.toString(), "credits_min_purchase"],
    ),
    pool.query(
      'UPDATE "SystemSettings" SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $2',
      [max_purchase.toString(), "credits_max_purchase"],
    ),
  ];

  await Promise.all(updates);

  res.json({ message: "Pricing settings updated successfully" });
});

// Get upload URL for audio files
router.post("/audio-upload-url", async (req, res, next) => {
  const { fileExtension } = req.body;

  if (!fileExtension) {
    return res.status(400).json({ error: "File extension is required" });
  }

  // Generate unique key for audio files
  const timestamp = Date.now();
  const key = `audio-references/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

  // Use the existing uploadFile method and generate a local path for development
  if (process.env.NODE_ENV === "production") {
    // For production, we'd need to implement S3 signed URL generation
    // For now, return an error suggesting to use the direct upload endpoint
    return res.status(400).json({
      error:
        "Direct upload not supported in production. Use the /audio-upload endpoint instead.",
    });
  } else {
    // For development, return local upload URL
    const serverUrl = process.env.SERVER_URL || "http://localhost:3005";
    const uploadUrl = `${serverUrl}/api/admin/audio-upload`;
    const publicUrl = `${serverUrl}/uploads/${key}`;

    res.json({ uploadUrl, publicUrl });
  }
});

// Handle local audio file upload (development only)
router.post(
  "/audio-upload",
  audioUpload.single("audio"),
  async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    // Generate unique key for audio files
    const timestamp = Date.now();
    const fileExt = req.file.originalname.split(".").pop();
    const key = `audio-references/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Upload to storage service
    const publicUrl = await storageService.uploadFile(
      key,
      req.file.buffer,
      req.file.mimetype,
    );

    res.json({
      success: true,
      url: publicUrl,
      filename: req.file.originalname,
      size: req.file.size,
    });
  },
);

// Add reference outfit to a persona
router.post("/personas/:personaId/outfits", async (req, res, next) => {
  const { personaId } = req.params;
  const { outfit } = req.body;

  if (!outfit || !outfit.id) {
    return res.status(400).json({ error: "Outfit data with ID is required" });
  }

  try {
    // Get current outfits
    const result = await pool.query(
      'SELECT reference_outfits FROM "AvatarPersona" WHERE id = $1',
      [personaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Persona not found" });
    }

    const currentOutfits = result.rows[0].reference_outfits || [];
    
    // Add new outfit
    const updatedOutfits = [...currentOutfits, outfit];

    // Update in database
    await pool.query(
      'UPDATE "AvatarPersona" SET reference_outfits = $1 WHERE id = $2',
      [JSON.stringify(updatedOutfits), personaId]
    );

    res.json({ success: true, outfit });
  } catch (error) {
    console.error("Error adding outfit:", error);
    res.status(500).json({ error: "Failed to add outfit" });
  }
});

// Update a reference outfit
router.patch("/personas/:personaId/outfits/:outfitId", async (req, res, next) => {
  const { personaId, outfitId } = req.params;
  const { updates } = req.body;

  try {
    // Get current outfits
    const result = await pool.query(
      'SELECT reference_outfits FROM "AvatarPersona" WHERE id = $1',
      [personaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Persona not found" });
    }

    const currentOutfits = result.rows[0].reference_outfits || [];
    
    // Update the specific outfit
    const updatedOutfits = currentOutfits.map(outfit =>
      outfit.id === outfitId ? { ...outfit, ...updates } : outfit
    );

    // Save back to database
    await pool.query(
      'UPDATE "AvatarPersona" SET reference_outfits = $1 WHERE id = $2',
      [JSON.stringify(updatedOutfits), personaId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating outfit:", error);
    res.status(500).json({ error: "Failed to update outfit" });
  }
});

// Delete a reference outfit
router.delete("/personas/:personaId/outfits/:outfitId", async (req, res, next) => {
  const { personaId, outfitId } = req.params;

  try {
    // Get current outfits
    const result = await pool.query(
      'SELECT reference_outfits FROM "AvatarPersona" WHERE id = $1',
      [personaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Persona not found" });
    }

    const currentOutfits = result.rows[0].reference_outfits || [];
    
    // Remove the outfit
    const updatedOutfits = currentOutfits.filter(outfit => outfit.id !== outfitId);

    // Save back to database
    await pool.query(
      'UPDATE "AvatarPersona" SET reference_outfits = $1 WHERE id = $2',
      [JSON.stringify(updatedOutfits), personaId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting outfit:", error);
    res.status(500).json({ error: "Failed to delete outfit" });
  }
});

export default router;
