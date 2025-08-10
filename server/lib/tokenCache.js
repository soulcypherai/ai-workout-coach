import { LRUCache } from 'lru-cache';
import { logger } from './cloudwatch-logger.js';

/**
 * Token and user data cache to reduce database queries
 * Uses LRU (Least Recently Used) cache with TTL (Time To Live)
 */
class TokenCache {
  constructor() {
    // Cache for verified tokens -> user data
    // Each entry expires after 5 minutes
    this.userCache = new LRUCache({
      max: 1000, // Maximum 1000 entries
      ttl: 1000 * 60 * 5, // 5 minutes TTL
      updateAgeOnGet: true, // Reset TTL on access
      updateAgeOnHas: true,
    });

    // Cache for invalid tokens to prevent repeated verification attempts
    // Shorter TTL since tokens might become valid again
    this.invalidTokenCache = new LRUCache({
      max: 500,
      ttl: 1000 * 60 * 2, // 2 minutes TTL for invalid tokens
    });

    // Track cache metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      invalidHits: 0,
      evictions: 0,
    };

    // Log metrics periodically
    setInterval(() => this.logMetrics(), 60000); // Every minute
  }

  /**
   * Get user data from cache
   * @param {string} token - The authentication token
   * @returns {Object|null} Cached user data or null if not found
   */
  getUser(token) {
    // Check if token is known to be invalid
    if (this.invalidTokenCache.has(token)) {
      this.metrics.invalidHits++;
      logger.debug('[TokenCache] Invalid token hit', {
        component: 'tokenCache',
      });
      return { invalid: true };
    }

    const userData = this.userCache.get(token);
    if (userData) {
      this.metrics.hits++;
      logger.debug('[TokenCache] Cache hit', {
        userId: userData.id,
        component: 'tokenCache',
      });
      return userData;
    }

    this.metrics.misses++;
    return null;
  }

  /**
   * Store user data in cache
   * @param {string} token - The authentication token
   * @param {Object} userData - User data to cache
   */
  setUser(token, userData) {
    // Remove from invalid cache if present
    this.invalidTokenCache.delete(token);
    
    // Add to user cache
    this.userCache.set(token, userData);
    
    logger.debug('[TokenCache] User cached', {
      userId: userData.id,
      component: 'tokenCache',
    });
  }

  /**
   * Mark a token as invalid
   * @param {string} token - The invalid token
   */
  setInvalid(token) {
    // Remove from user cache if present
    this.userCache.delete(token);
    
    // Add to invalid cache
    this.invalidTokenCache.set(token, true);
    
    logger.debug('[TokenCache] Token marked as invalid', {
      component: 'tokenCache',
    });
  }

  /**
   * Invalidate a specific user's cached data
   * @param {string} userId - The user ID to invalidate
   */
  invalidateUser(userId) {
    // Find and remove all entries for this user
    let removed = 0;
    for (const [token, userData] of this.userCache.entries()) {
      if (userData.id === userId) {
        this.userCache.delete(token);
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.info('[TokenCache] User cache invalidated', {
        userId,
        entriesRemoved: removed,
        component: 'tokenCache',
      });
    }
  }

  /**
   * Clear all caches
   */
  clear() {
    const userCacheSize = this.userCache.size;
    const invalidCacheSize = this.invalidTokenCache.size;
    
    this.userCache.clear();
    this.invalidTokenCache.clear();
    
    logger.info('[TokenCache] Caches cleared', {
      userCacheSize,
      invalidCacheSize,
      component: 'tokenCache',
    });
  }

  /**
   * Log cache metrics
   */
  logMetrics() {
    const hitRate = this.metrics.hits + this.metrics.misses > 0
      ? (this.metrics.hits / (this.metrics.hits + this.metrics.misses) * 100).toFixed(2)
      : 0;

    logger.info('[TokenCache] Metrics', {
      ...this.metrics,
      hitRate: `${hitRate}%`,
      userCacheSize: this.userCache.size,
      invalidCacheSize: this.invalidTokenCache.size,
      component: 'tokenCache',
    });
  }

  /**
   * Get current cache statistics
   */
  getStats() {
    return {
      userCacheSize: this.userCache.size,
      invalidCacheSize: this.invalidTokenCache.size,
      metrics: { ...this.metrics },
      hitRate: this.metrics.hits + this.metrics.misses > 0
        ? (this.metrics.hits / (this.metrics.hits + this.metrics.misses) * 100).toFixed(2) + '%'
        : '0%',
    };
  }
}

// Export singleton instance
export const tokenCache = new TokenCache();