import { performanceAlerts } from '../lib/alerting.js';
import { logger } from '../lib/cloudwatch-logger.js';

/**
 * Middleware to monitor API response times and alert on slow responses
 */
export const performanceMonitorMiddleware = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override res.end to capture response time
  res.end = function(...args) {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Get endpoint for alerting
    const endpoint = `${req.method} ${req.route?.path || req.path}`;
    
    // Log slow responses
    if (responseTime > 5000) { // 5 seconds
      logger.warn('Slow response detected', { 
        endpoint, 
        responseTime: responseTime.toFixed(2), 
        component: 'performanceMonitor' 
      });
    }
    
    // Send alert for very slow responses
    if (responseTime > 10000) { // 10 seconds
      performanceAlerts.slowResponse(endpoint, Math.round(responseTime));
    }
    
    // Add response time header for debugging
    res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
    
    // Call original end function
    originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Enhanced performance monitoring with custom thresholds
 */
export const createPerformanceMonitor = (options = {}) => {
  const {
    slowThreshold = 5000,    // Log slow responses after 5s
    alertThreshold = 10000,  // Send alert after 10s
    includeUserAgent = false,
    excludePaths = ['/health', '/favicon.ico']
  } = options;
  
  return (req, res, next) => {
    // Skip monitoring for excluded paths
    if (excludePaths.some(path => req.path.includes(path))) {
      return next();
    }
    
    const startTime = process.hrtime.bigint();
    const originalEnd = res.end;
    
    res.end = function(...args) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;
      
      const endpoint = `${req.method} ${req.route?.path || req.path}`;
      const context = {
        responseTime: Math.round(responseTime),
        statusCode: res.statusCode,
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress,
        ...(includeUserAgent && { userAgent: req.get('User-Agent') })
      };
      
      // Log slow responses
      if (responseTime > slowThreshold) {
        logger.warn('Slow response detected', { 
          endpoint, 
          responseTime: responseTime.toFixed(2), 
          ...context, 
          component: 'performanceMonitor' 
        });
      }
      
      // Send alert for very slow responses
      if (responseTime > alertThreshold) {
        performanceAlerts.slowResponse(endpoint, Math.round(responseTime));
      }
      
      // Add response time header
      res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
      
      originalEnd.apply(this, args);
    };
    
    next();
  };
};

export default performanceMonitorMiddleware;