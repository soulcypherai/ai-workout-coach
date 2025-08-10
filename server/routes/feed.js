import { Router } from 'express';
import multer from 'multer';
import 'dotenv/config';
import communityFeedService from '../services/communityFeed.js';
import storageService from '../services/storage.js';
import { verifyJWTMiddleware } from '../middleware/auth.js';

// UUID validation helper
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const router = Router();

// Multer setup for file uploads (local development only)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { 
    fileSize: 200 * 1024 * 1024 // 200MB max file size
  },
  fileFilter: (req, file, cb) => {
    console.log('[Feed] Upload file mimetype:', file.mimetype);
    if (file.mimetype.startsWith('video/mp4') || file.mimetype.startsWith('video/webm')) {
      cb(null, true);
    } else {
      cb(new Error(`Only MP4 and WebM video files are allowed. Received: ${file.mimetype}`));
    }
  }
});

/**
 * GET /api/feed?cursor=<isoDate>&before=<isoDate>&limit=<number>
 * Returns paginated community posts in reverse chronological order
 * - cursor: Get posts older than this timestamp (for scrolling down)
 * - before: Get posts newer than this timestamp (for scrolling up)
 * - Cannot use both cursor and before in the same request
 */
router.get('/', async (req, res, next) => {
  const { cursor, before, limit = 20, includeHidden = false } = req.query;
  
  if (cursor && before) {
    return res.status(400).json({ error: 'Cannot use both cursor and before parameters' });
  }
  
  const result = await communityFeedService.getFeedPosts(cursor, before, parseInt(limit), includeHidden === 'true');
  res.json(result);
});

/**
 * POST /api/feed/upload-url
 * Generate a pre-signed URL for video upload
 */
router.post('/upload-url', verifyJWTMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const result = await storageService.generateUploadUrl(userId);
  res.json(result);
});

/**
 * POST /api/feed/process-video
 * Trigger video processing after S3 upload (production)
 */
router.post('/process-video', verifyJWTMiddleware, async (req, res, next) => {
  const { key } = req.body;
  
  if (!key) {
    return res.status(400).json({ error: 'Video key is required' });
  }
  
  // Process video in background
  setImmediate(async () => {
    await storageService.processVideoAfterUpload(key);
  });
  
  res.json({ message: 'Video processing initiated' });
});

/**
 * POST /api/feed/upload/:key (for local development only)
 * Direct file upload endpoint for local development
 */
router.post('/upload/:key', verifyJWTMiddleware, upload.single('video'), async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'This endpoint is only available in development' });
  }

  const { userId } = req.user;
  const key = decodeURIComponent(req.params.key);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  console.log('[Feed] Received video file:', {
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.buffer ? req.file.buffer.length : 0,
    key: key
  });

  if (!req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({ error: 'Video file is empty' });
  }

  // Save file locally
  await storageService.saveFileLocally(key, req.file.buffer);
  
  // Process video in background (local and production)
  setImmediate(async () => {
    await storageService.processVideoAfterUpload(key, req.file.buffer);
  });

  res.json({
    message: 'Video uploaded successfully',
    key,
    publicUrl: storageService.getPublicUrl(key)
  });
});

/**
 * POST /api/feed/posts
 * Create a new community post
 */
router.post('/posts', verifyJWTMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const postData = {
    userId,
    ...req.body
  };
  
  const post = await communityFeedService.createPost(postData);
  res.status(201).json({
    message: 'Post created successfully',
    post
  });
});

/**
 * GET /api/feed/posts/:id
 * Get a specific post by ID
 */
router.get('/posts/:id', async (req, res, next) => {
  const { id } = req.params;
  
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid post ID format' });
  }
  
  const post = await communityFeedService.getPostById(id);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  res.json({ post });
});

/**
 * POST /api/feed/posts/:id/reactions
 * Add or update a like/dislike on a post
 */
router.post('/posts/:id/reactions', verifyJWTMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const { id: postId } = req.params;
  const { value } = req.body;
  
  if (!isValidUUID(postId)) {
    return res.status(400).json({ error: 'Invalid post ID format' });
  }
  
  const counts = await communityFeedService.upsertReaction(postId, userId, value);
  
  res.json({
    message: 'Reaction updated successfully',
    postId,
    ...counts
  });
});

/**
 * GET /api/feed/posts/:id/reactions/me
 * Get current user's reaction to a post
 */
router.get('/posts/:id/reactions/me', verifyJWTMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const { id: postId } = req.params;
  
  const reaction = await communityFeedService.getUserReaction(postId, userId);
  
  res.json({ reaction });
});

/**
 * GET /api/feed/posts/:id/comments?cursor=<timestamp>&limit=<number>
 * Get paginated comments for a post
 */
router.get('/posts/:id/comments', async (req, res, next) => {
  const { id: postId } = req.params;
  const { cursor, limit = 20 } = req.query;
  
  if (!isValidUUID(postId)) {
    return res.status(400).json({ error: 'Invalid post ID format' });
  }
  
  const result = await communityFeedService.getPostComments(postId, cursor, parseInt(limit));
  res.json(result);
});

/**
 * POST /api/feed/posts/:id/comments
 * Add a comment to a post
 */
router.post('/posts/:id/comments', verifyJWTMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const { id: postId } = req.params;
  const { body } = req.body;
  
  if (!isValidUUID(postId)) {
    return res.status(400).json({ error: 'Invalid post ID format' });
  }
  
  const comment = await communityFeedService.createComment(postId, userId, body);
  
  res.status(201).json({
    message: 'Comment created successfully',
    comment
  });
});

/**
 * GET /api/feed/users/:id/posts
 * Get posts by a specific user
 */
router.get('/users/:id/posts', async (req, res, next) => {
  const { id: userId } = req.params;
  const { cursor, limit = 20 } = req.query;
  
  const result = await communityFeedService.getUserPosts(userId, cursor, parseInt(limit));
  res.json(result);
});

/**
 * DELETE /api/feed/posts/:id
 * Delete a post (only by the author)
 */
router.delete('/posts/:id', verifyJWTMiddleware, async (req, res, next) => {
  const { userId } = req.user;
  const { id: postId } = req.params;
  
  const deletedPost = await communityFeedService.deletePost(postId, userId);
  
  res.json({
    message: 'Post deleted successfully',
    post: deletedPost
  });
});

/**
 * GET /api/feed/posts/:id/stats
 * Get post statistics
 */
router.get('/posts/:id/stats', async (req, res, next) => {
  const { id: postId } = req.params;
  const stats = await communityFeedService.getPostStats(postId);
  res.json({ stats });
});

export default router;