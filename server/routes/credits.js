import { Router } from 'express';
import { creditsService } from '../services/creditsService.js';
import pool from '../db/index.js';
import { verifyJWTMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * Get user's credit balance
 */
router.get('/balance', verifyJWTMiddleware, async (req, res, next) => {
  const credits = await creditsService.getUserCredits(req.user.userId);
  res.json({ credits });
});

/**
 * Validate if user has sufficient credits for avatar
 */
router.post('/validate', verifyJWTMiddleware, async (req, res, next) => {
  const { avatarId, estimatedMinutes = 1 } = req.body;
  
  if (!avatarId) {
    return res.status(400).json({ error: 'Avatar ID is required' });
  }
  
  // Get avatar pricing
  const avatarResult = await pool.query(
    'SELECT pricing_per_min, name FROM "AvatarPersona" WHERE id = $1',
    [avatarId]
  );
  
  if (avatarResult.rows.length === 0) {
    return res.status(404).json({ error: 'Avatar not found' });
  }
  
  const { pricing_per_min, name } = avatarResult.rows[0];
  const perMinuteCost = pricing_per_min || 1; 
  const totalRequired = perMinuteCost * estimatedMinutes;
  
  const validation = await creditsService.validateSufficientCredits(
    req.user.userId, 
    totalRequired
  );
  
  res.json({
    ...validation,
    avatarName: name,
    perMinuteCost,
    estimatedTotal: totalRequired,
    estimatedMinutes
  });
});

/**
 * Get credit transaction history
 */
router.get('/history', verifyJWTMiddleware, async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 transactions
  const history = await creditsService.getCreditHistory(req.user.userId, limit);
  res.json({ transactions: history });
});

/**
 * Add bonus credits (for daily bonus, etc.)
 */
router.post('/bonus', verifyJWTMiddleware, async (req, res, next) => {
  const { amount, description = 'Daily bonus' } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid bonus amount' });
  }
  
  // Simple rate limiting - once per day
  const today = new Date().toISOString().split('T')[0];
  const existingBonus = await pool.query(
    `SELECT id FROM "CreditTransaction" 
     WHERE user_id = $1 AND type = 'bonus' 
     AND DATE(created_at) = $2`,
    [req.user.userId, today]
  );
  
  if (existingBonus.rows.length > 0) {
    return res.status(400).json({ error: 'Daily bonus already claimed today' });
  }
  
  const newBalance = await creditsService.addBonusCredits(
    req.user.userId,
    amount,
    description
  );
  
  res.json({ 
    message: 'Bonus credits added successfully',
    newBalance,
    amount
  });
});

export default router; 