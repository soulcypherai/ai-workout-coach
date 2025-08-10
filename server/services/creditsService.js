import pool from '../db/index.js';
import { businessAlerts } from '../lib/alerting.js';
import { logger } from '../lib/cloudwatch-logger.js';

export class CreditsService {
  /**
   * Get user's current credit balance
   */
  async getUserCredits(userId) {
    try {
      const result = await pool.query(
        'SELECT credits FROM "User" WHERE id = $1',
        [userId]
      );
      return result.rows[0]?.credits || 0;
    } catch (error) {
      logger.error('Error fetching user credits', { error: error.message, userId, component: 'creditsService' });
      throw error;
    }
  }

  /**
   * Add credits to user account (after purchase)
   */
  async addCredits(userId, amount, description, paymentIntentId = null, providedClient = null) {
    const client = providedClient || await pool.connect();
    const shouldManageTransaction = !providedClient;
    
    try {
      if (shouldManageTransaction) {
        await client.query('BEGIN');
      }
      
      // Update user balance
      await client.query(
        'UPDATE "User" SET credits = credits + $1, updated_at = NOW() WHERE id = $2',
        [amount, userId]
      );
      
      // Log transaction
      await client.query(
        'INSERT INTO "CreditTransaction" (user_id, type, amount, description, stripe_payment_intent_id) VALUES ($1, $2, $3, $4, $5)',
        [userId, 'purchase', amount, description, paymentIntentId]
      );
      
      if (shouldManageTransaction) {
        await client.query('COMMIT');
      }
      
      logger.info('Added credits to user', { amount, userId, component: 'creditsService' });
      
      return await this.getUserCredits(userId);
    } catch (error) {
      if (shouldManageTransaction) {
        await client.query('ROLLBACK');
      }
      logger.error('Error adding credits', { error: error.message, userId, amount, component: 'creditsService' });
      
      // Alert on credit system error
      businessAlerts.creditSystemError(userId, 'add_credits', error);
      
      throw error;
    } finally {
      if (shouldManageTransaction) {
        client.release();
      }
    }
  }

  /**
   * Deduct credits from user account (for refunds)
   */
  async deductCredits(userId, amount, description, paymentIntentId = null, providedClient = null) {
    const client = providedClient || await pool.connect();
    const shouldManageTransaction = !providedClient;
    
    try {
      if (shouldManageTransaction) {
        await client.query('BEGIN');
      }
      
      // Update user balance (can go negative for refunds)
      await client.query(
        'UPDATE "User" SET credits = credits - $1, updated_at = NOW() WHERE id = $2',
        [amount, userId]
      );
      
      // Log transaction
      await client.query(
        'INSERT INTO "CreditTransaction" (user_id, type, amount, description, stripe_payment_intent_id) VALUES ($1, $2, $3, $4, $5)',
        [userId, 'refund', -amount, description, paymentIntentId]
      );
      
      if (shouldManageTransaction) {
        await client.query('COMMIT');
      }
      
      logger.info('Deducted credits from user', { amount, userId, component: 'creditsService' });
      
      return await this.getUserCredits(userId);
    } catch (error) {
      if (shouldManageTransaction) {
        await client.query('ROLLBACK');
      }
      logger.error('Error deducting credits', { error: error.message, userId, amount, component: 'creditsService' });
      
      // Alert on credit system error
      businessAlerts.creditSystemError(userId, 'deduct_credits', error);
      
      throw error;
    } finally {
      if (shouldManageTransaction) {
        client.release();
      }
    }
  }

  /**
   * Spend credits (with validation)
   */
  async spendCredits(userId, amount, description, avatarPersonaId = null, callSessionId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check sufficient balance
      const currentBalance = await this.getUserCredits(userId);
      if (currentBalance < amount) {
        throw new Error(`Insufficient credits. Required: ${amount}, Available: ${currentBalance}`);
      }
      
      // Deduct credits
      await client.query(
        'UPDATE "User" SET credits = credits - $1, updated_at = NOW() WHERE id = $2',
        [amount, userId]
      );
      
      // Log transaction
      await client.query(
        'INSERT INTO "CreditTransaction" (user_id, type, amount, description, avatar_persona_id, call_session_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, 'spend', -amount, description, avatarPersonaId, callSessionId]
      );
      
      await client.query('COMMIT');
      logger.info('Spent credits for user', { amount, userId, component: 'creditsService' });
      
      return await this.getUserCredits(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error spending credits', { error: error.message, userId, amount, component: 'creditsService' });
      
      // Alert on credit system error
      businessAlerts.creditSystemError(userId, 'spend_credits', error);
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate user has sufficient credits before call
   */
  async validateSufficientCredits(userId, requiredCredits) {
    try {
      const balance = await this.getUserCredits(userId);
      return {
        sufficient: balance >= requiredCredits,
        currentBalance: balance,
        required: requiredCredits,
        deficit: Math.max(0, requiredCredits - balance)
      };
    } catch (error) {
      logger.error('Error validating credits', { error: error.message, userId, component: 'creditsService' });
      throw error;
    }
  }

  /**
   * Get user's credit transaction history
   */
  async getCreditHistory(userId, limit = 50) {
    try {
      const result = await pool.query(
        `SELECT ct.*, ap.name as avatar_name 
         FROM "CreditTransaction" ct
         LEFT JOIN "AvatarPersona" ap ON ct.avatar_persona_id = ap.id
         WHERE ct.user_id = $1 
         ORDER BY ct.created_at DESC 
         LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching credit history', { error: error.message, userId, component: 'creditsService' });
      throw error;
    }
  }

  /**
   * Add bonus credits (daily bonus, promotional, etc.)
   */
  async addBonusCredits(userId, amount, description) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update user balance
      await client.query(
        'UPDATE "User" SET credits = credits + $1, updated_at = NOW() WHERE id = $2',
        [amount, userId]
      );
      
      // Log transaction
      await client.query(
        'INSERT INTO "CreditTransaction" (user_id, type, amount, description) VALUES ($1, $2, $3, $4)',
        [userId, 'bonus', amount, description]
      );
      
      await client.query('COMMIT');
      logger.info('Added bonus credits to user', { amount, userId, component: 'creditsService' });
      
      return await this.getUserCredits(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding bonus credits', { error: error.message, userId, amount, component: 'creditsService' });
      throw error;
    } finally {
      client.release();
    }
  }
}

export const creditsService = new CreditsService(); 