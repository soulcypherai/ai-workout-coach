// Amazon Purchase API Routes
import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/index.js';
import { getTrendingProducts, executePurchase, confirmPurchase } from '../tools/amazon-purchase.js';
import { flags } from '../utils/feature-flags.js';
import { logger } from '../lib/cloudwatch-logger.js';

const router = Router();

// Validation schemas
const ExecutePurchaseSchema = z.object({
  asin: z.string().regex(/^amazon:B[0-9A-Z]{9}$/, 'Invalid ASIN format'),
  callSessionId: z.string().uuid('Invalid UUID format')
});

const ConfirmPurchaseSchema = z.object({
  asin: z.string().regex(/^amazon:B[0-9A-Z]{9}$/, 'Invalid ASIN format'),
  callSessionId: z.string().uuid('Invalid UUID format'),
  ok: z.boolean()
});

/**
 * GET /api/v1/products/trending
 * Get trending Amazon products (hardcoded list)
 */
router.get('/products/trending', async (req, res, next) => {
  try {
    logger.info('GET /products/trending called', {
      featureEnabled: flags.FEAT_AMAZON_PURCHASE_ENABLED,
      component: 'purchase-routes'
    });

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      return res.json({ products: [] });
    }

    const products = await getTrendingProducts();
    
    res.json({ products });

  } catch (error) {
    logger.error('Error fetching trending products', {
      error: error.message,
      component: 'purchase-routes'
    });
    
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/v1/purchase/confirm
 * Confirm or show purchase confirmation
 */
router.post('/purchase/confirm', async (req, res, next) => {
  try {
    logger.info('POST /purchase/confirm called', {
      body: req.body,
      featureEnabled: flags.FEAT_AMAZON_PURCHASE_ENABLED,
      component: 'purchase-routes'
    });

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      return res.status(503).json({
        error: 'Amazon purchase feature is disabled',
        code: 'FEATURE_DISABLED'
      });
    }

    // Validate request body
    const validatedData = ConfirmPurchaseSchema.parse(req.body);
    const { asin, callSessionId, ok } = validatedData;

    const result = await confirmPurchase(asin, callSessionId, ok);
    
    res.json(result);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        code: 'BAD_REQUEST',
        details: error.errors
      });
    }

    logger.error('Error in purchase confirmation', {
      error: error.message,
      body: req.body,
      component: 'purchase-routes'
    });
    
    res.status(500).json({
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/v1/purchase/execute
 * Execute Amazon product purchase via Crossmint
 */
router.post('/purchase/execute', async (req, res, next) => {
  try {
    logger.info('POST /purchase/execute called', {
      body: req.body,
      featureEnabled: flags.FEAT_AMAZON_PURCHASE_ENABLED,
      component: 'purchase-routes'
    });

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      return res.status(503).json({
        error: 'Amazon purchase feature is disabled',
        code: 'FEATURE_DISABLED'
      });
    }

    // Validate request body
    const validatedData = ExecutePurchaseSchema.parse(req.body);
    const { asin, callSessionId } = validatedData;

    const result = await executePurchase(asin, callSessionId);
    
    res.json(result);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        code: 'BAD_REQUEST',
        details: error.errors
      });
    }

    // Handle custom errors from executePurchase
    if (error.statusCode && error.code) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code
      });
    }

    logger.error('Error executing purchase', {
      error: error.message,
      errorStack: error.stack,
      body: req.body,
      component: 'purchase-routes'
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/v1/purchase/history/:callSessionId
 * Get purchase history for a call session (for debugging/admin)
 */
router.get('/purchase/history/:callSessionId', async (req, res, next) => {
  try {
    const { callSessionId } = req.params;

    if (!flags.FEAT_AMAZON_PURCHASE_ENABLED) {
      return res.json({ purchases: [] });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(callSessionId)) {
      return res.status(400).json({
        error: 'Invalid call session ID format',
        code: 'BAD_REQUEST'
      });
    }

    const query = `
      SELECT 
        order_id,
        product_asin,
        status,
        tx_hash,
        created_at,
        updated_at
      FROM purchase_logs 
      WHERE call_session_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query, [callSessionId]);
    
    res.json({ 
      purchases: result.rows,
      callSessionId 
    });

  } catch (error) {
    logger.error('Error fetching purchase history', {
      error: error.message,
      callSessionId: req.params.callSessionId,
      component: 'purchase-routes'
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
