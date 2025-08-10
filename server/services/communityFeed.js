import pool from '../db/index.js';

class CommunityFeedService {
  /**
   * Get paginated community posts in reverse chronological order
   * @param {string|null} cursor - Get posts older than this timestamp
   * @param {string|null} before - Get posts newer than this timestamp
   * @param {number} limit - Number of posts to fetch
   * @param {boolean} includeHidden - Whether to include hidden posts
   */

  // Previous Query
  // async getFeedPosts(cursor = null, before = null, limit = 20, includeHidden = false) {
  //   const pageLimit = Math.min(limit, 50); // Max 50 posts per page

  //   let query = `
  //     SELECT
  //       p.*,
  //       u.handle,
  //       u.wallet_address,
  //       COALESCE(cs.transcript::text, p.transcript, '') as transcript,
  //       COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0)::int as likes_count,
  //       COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0)::int as dislikes_count,
  //       COALESCE(SUM(r.value), 0)::int as score,
  //       COUNT(c.*)::int as comment_count
  //     FROM "CommunityPost" p
  //     LEFT JOIN "User" u ON u.id = p.posted_by
  //     LEFT JOIN "CallSession" cs ON cs.id = p.call_id
  //     LEFT JOIN "CommunityReaction" r ON r.post_id = p.id
  //     LEFT JOIN "CommunityComment" c ON c.post_id = p.id
  //   `;

  //   const params = [];
  //   let whereConditions = [];

  //   // Filter out hidden posts unless specifically requested (for admin)
  //   if (!includeHidden) {
  //     whereConditions.push('(p.hidden = FALSE OR p.hidden IS NULL)');
  //   }

  //   // Handle cursor (older posts) and before (newer posts)
  //   if (cursor && before) {
  //     throw new Error('Cannot use both cursor and before parameters');
  //   }

  //   if (cursor) {
  //     whereConditions.push(`p.created_at < $${params.length + 1}`);
  //     params.push(cursor);
  //   }

  //   if (before) {
  //     whereConditions.push(`p.created_at > $${params.length + 1}`);
  //     params.push(before);
  //   }

  //   if (whereConditions.length > 0) {
  //     query += ' WHERE ' + whereConditions.join(' AND ');
  //   }

  //   query += `
  //     GROUP BY p.id, u.handle, u.wallet_address, cs.transcript
  //     ORDER BY p.created_at DESC
  //     LIMIT $${params.length + 1}
  //   `;
  //   params.push(pageLimit);

  //   const result = await pool.query(query, params);

  //   return {
  //     posts: result.rows,
  //     hasMore: result.rows.length === pageLimit,
  //     nextCursor: result.rows.length > 0 ? result.rows[result.rows.length - 1].created_at : null
  //   };
  // }

  // New Query with correct reaction count
  async getFeedPosts(
    cursor = null,
    before = null,
    limit = 20,
    includeHidden = false,
  ) {
    const pageLimit = Math.min(limit, 50);

    let query = `
    SELECT 
      p.*,
      u.handle,
      u.wallet_address,
      COALESCE(cs.transcript::text, p.transcript, '') AS transcript,
      COALESCE(r.likes_count, 0)::int AS likes_count,
      COALESCE(r.dislikes_count, 0)::int AS dislikes_count,
      COALESCE(r.score, 0)::int AS score,
      COALESCE(c.comment_count, 0)::int AS comment_count,
      ap.id as avatar_id,
      ap.name as avatar_name,
      ap.description as avatar_description,
      ap.image_url as avatar_image_url,
      ap.slug as avatar_slug
    FROM "CommunityPost" p
    LEFT JOIN "User" u ON u.id = p.posted_by
    LEFT JOIN "CallSession" cs ON cs.id = p.call_id
    LEFT JOIN "AvatarPersona" ap ON ap.id = cs.avatar_id::uuid

    LEFT JOIN (
      SELECT 
        post_id,
        SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) AS likes_count,
        SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) AS dislikes_count,
        SUM(value) AS score
      FROM "CommunityReaction"
      GROUP BY post_id
    ) r ON r.post_id = p.id

    LEFT JOIN (
      SELECT 
        post_id,
        COUNT(*) AS comment_count
      FROM "CommunityComment"
      GROUP BY post_id
    ) c ON c.post_id = p.id
  `;

    const params = [];
    const whereConditions = [];

    if (!includeHidden) {
      whereConditions.push("(p.hidden = FALSE OR p.hidden IS NULL)");
    }

    if (cursor && before) {
      throw new Error("Cannot use both cursor and before parameters");
    }

    if (cursor) {
      whereConditions.push(`p.created_at < $${params.length + 1}`);
      params.push(cursor);
    }

    if (before) {
      whereConditions.push(`p.created_at > $${params.length + 1}`);
      params.push(before);
    }

    if (whereConditions.length > 0) {
      query += " WHERE " + whereConditions.join(" AND ");
    }

    query += `
    ORDER BY p.created_at DESC
    LIMIT $${params.length + 1}
  `;
    params.push(pageLimit);

    const result = await pool.query(query, params);

    return {
      posts: result.rows,
      hasMore: result.rows.length === pageLimit,
      nextCursor:
        result.rows.length > 0
          ? result.rows[result.rows.length - 1].created_at
          : null,
    };
  }

  /**
   * Create a new community post
   */
  async createPost(postData) {
    const {
      userId,
      callId,
      projectId,
      videoUrl,
      thumbnailUrl,
      durationSec,
      transcript,
    } = postData;

    // Validate duration
    if (durationSec && durationSec > 120) {
      throw new Error("Video duration cannot exceed 120 seconds");
    }

    const result = await pool.query(
      `
      INSERT INTO "CommunityPost" 
      (call_id, project_id, video_url, thumbnail_url, posted_by, duration_sec, transcript)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        callId,
        projectId,
        videoUrl,
        thumbnailUrl,
        userId,
        durationSec,
        transcript,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get a specific post by ID
   */
  async getPostById(postId) {
    const result = await pool.query(
      `
      SELECT 
        p.*,
        u.handle,
        u.wallet_address,
        COALESCE(cs.transcript::text, p.transcript, '') as transcript,
        COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0)::int as likes_count,
        COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0)::int as dislikes_count,
        COALESCE(SUM(r.value), 0)::int as score,
        COUNT(c.*)::int as comment_count,
        ap.id as avatar_id,
        ap.name as avatar_name,
        ap.description as avatar_description,
        ap.image_url as avatar_image_url,
        ap.slug as avatar_slug
      FROM "CommunityPost" p
      LEFT JOIN "User" u ON u.id = p.posted_by
      LEFT JOIN "CallSession" cs ON cs.id = p.call_id
      LEFT JOIN "AvatarPersona" ap ON ap.id = cs.avatar_id::uuid
      LEFT JOIN "CommunityReaction" r ON r.post_id = p.id
      LEFT JOIN "CommunityComment" c ON c.post_id = p.id
      WHERE p.id = $1
      GROUP BY p.id, u.handle, u.wallet_address, cs.transcript, ap.id, ap.name, ap.description, ap.image_url, ap.slug
    `,
      [postId],
    );

    return result.rows[0] || null;
  }

  /**
   * Add or update a reaction (like/dislike) on a post
   */

  // older query withot unlike handling
  // async upsertReaction(postId, userId, value) {
  //   if (![1, -1].includes(value)) {
  //     throw new Error('Value must be 1 (like) or -1 (dislike)');
  //   }

  //   // Check if post exists
  //   const postExists = await this.getPostById(postId);
  //   if (!postExists) {
  //     throw new Error('Post not found');
  //   }

  //   // Upsert reaction
  //   await pool.query(`
  //     INSERT INTO "CommunityReaction" (post_id, user_id, value)
  //     VALUES ($1, $2, $3)
  //     ON CONFLICT (post_id, user_id)
  //     DO UPDATE SET value = $3, created_at = NOW()
  //   `, [postId, userId, value]);

  //   // Get updated counts
  //   const countsResult = await pool.query(`
  //     SELECT
  //       COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0)::int as likes_count,
  //       COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)::int as dislikes_count,
  //       COALESCE(SUM(value), 0)::int as score
  //     FROM "CommunityReaction"
  //     WHERE post_id = $1
  //   `, [postId]);

  //   return countsResult.rows[0];
  // }

  // new query with support for removing reaction
  async upsertReaction(postId, userId, value) {
    if (![1, -1, 0].includes(value)) {
      throw new Error("Value must be 1 (like), -1 (dislike), or 0 (remove)");
    }

    // Check if post exists
    const postExists = await this.getPostById(postId);
    if (!postExists) {
      throw new Error("Post not found");
    }

    if (value === 0) {
      // Remove the reaction
      await pool.query(
        `
      DELETE FROM "CommunityReaction"
      WHERE post_id = $1 AND user_id = $2
    `,
        [postId, userId],
      );
    } else {
      // Upsert like or dislike
      await pool.query(
        `
      INSERT INTO "CommunityReaction" (post_id, user_id, value)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id, user_id)
      DO UPDATE SET value = $3, created_at = NOW()
    `,
        [postId, userId, value],
      );
    }

    // Get updated counts
    const countsResult = await pool.query(
      `
    SELECT 
      COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0)::int AS likes_count,
      COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0)::int AS dislikes_count,
      COALESCE(SUM(value), 0)::int AS score
    FROM "CommunityReaction"
    WHERE post_id = $1
  `,
      [postId],
    );

    return countsResult.rows[0];
  }

  /**
   * Get user's reaction to a specific post
   */
  async getUserReaction(postId, userId) {
    const result = await pool.query(
      `
      SELECT value
      FROM "CommunityReaction"
      WHERE post_id = $1 AND user_id = $2
    `,
      [postId, userId],
    );

    return result.rows[0]?.value || null;
  }

  /**
   * Get paginated comments for a post
   */
  async getPostComments(postId, cursor = null, limit = 20) {
    const pageLimit = Math.min(limit, 50);

    let query = `
      SELECT 
        c.*,
        u.handle,
        u.wallet_address
      FROM "CommunityComment" c
      LEFT JOIN "User" u ON u.id = c.user_id
      WHERE c.post_id = $1
    `;

    const params = [postId];

    if (cursor) {
      query += " AND c.created_at < $2";
      params.push(cursor);
    }

    query += `
      ORDER BY c.created_at DESC
      LIMIT $${params.length + 1}
    `;
    params.push(pageLimit);

    const result = await pool.query(query, params);

    return {
      comments: result.rows,
      hasMore: result.rows.length === pageLimit,
      nextCursor:
        result.rows.length > 0
          ? result.rows[result.rows.length - 1].created_at
          : null,
    };
  }

  /**
   * Add a comment to a post
   */
  async createComment(postId, userId, body) {
    if (!body || body.trim().length === 0) {
      throw new Error("Comment body cannot be empty");
    }

    if (body.length > 1000) {
      throw new Error("Comment cannot exceed 1000 characters");
    }

    // Check if post exists
    const postExists = await this.getPostById(postId);
    if (!postExists) {
      throw new Error("Post not found");
    }

    // Insert comment
    const result = await pool.query(
      `
      INSERT INTO "CommunityComment" (post_id, user_id, body)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
      [postId, userId, body.trim()],
    );

    const comment = result.rows[0];

    // Get user info for response
    const userResult = await pool.query(
      'SELECT handle, wallet_address FROM "User" WHERE id = $1',
      [userId],
    );
    const user = userResult.rows[0];

    return {
      ...comment,
      handle: user.handle,
      wallet_address: user.wallet_address,
    };
  }

  /**
   * Update post with processed video information
   */
  async updatePostAfterProcessing(
    postId,
    videoUrl,
    thumbnailUrl,
    duration,
    transcript,
  ) {
    const result = await pool.query(
      `
      UPDATE "CommunityPost"
      SET 
        video_url = $2,
        thumbnail_url = $3,
        duration_sec = $4,
        transcript = $5
      WHERE id = $1
      RETURNING *
    `,
      [postId, videoUrl, thumbnailUrl, duration, transcript],
    );

    return result.rows[0];
  }

  /**
   * Get posts by user ID
   */
  async getUserPosts(userId, cursor = null, limit = 20) {
    const pageLimit = Math.min(limit, 50);

    let query = `
      SELECT 
        p.*,
        u.handle,
        u.wallet_address,
        COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0)::int as likes_count,
        COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0)::int as dislikes_count,
        COALESCE(SUM(r.value), 0)::int as score,
        COUNT(c.*)::int as comment_count
      FROM "CommunityPost" p
      LEFT JOIN "User" u ON u.id = p.posted_by
      LEFT JOIN "CommunityReaction" r ON r.post_id = p.id
      LEFT JOIN "CommunityComment" c ON c.post_id = p.id
      WHERE p.posted_by = $1
    `;

    const params = [userId];

    if (cursor) {
      query += " AND p.created_at < $2";
      params.push(cursor);
    }

    query += `
      GROUP BY p.id, u.handle, u.wallet_address
      ORDER BY p.created_at DESC
      LIMIT $${params.length + 1}
    `;
    params.push(pageLimit);

    const result = await pool.query(query, params);

    return {
      posts: result.rows,
      hasMore: result.rows.length === pageLimit,
      nextCursor:
        result.rows.length > 0
          ? result.rows[result.rows.length - 1].created_at
          : null,
    };
  }

  /**
   * Delete a post (only by the author)
   */
  async deletePost(postId, userId) {
    const result = await pool.query(
      `
      DELETE FROM "CommunityPost"
      WHERE id = $1 AND posted_by = $2
      RETURNING *
    `,
      [postId, userId],
    );

    if (result.rows.length === 0) {
      throw new Error(
        "Post not found or you do not have permission to delete it",
      );
    }

    return result.rows[0];
  }

  /**
   * Get post statistics
   */
  async getPostStats(postId) {
    const result = await pool.query(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN r.value = 1 THEN 1 ELSE 0 END), 0)::int as likes_count,
        COALESCE(SUM(CASE WHEN r.value = -1 THEN 1 ELSE 0 END), 0)::int as dislikes_count,
        COALESCE(SUM(r.value), 0)::int as score,
        (SELECT COUNT(*)::int FROM "CommunityComment" WHERE post_id = $1) as comment_count
      FROM "CommunityReaction" r
      WHERE r.post_id = $1
    `,
      [postId],
    );

    return result.rows[0];
  }
}

export default new CommunityFeedService();
