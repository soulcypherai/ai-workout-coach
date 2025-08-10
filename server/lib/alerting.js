import { monitoring } from './monitoring.js';

// Alert severity levels
export const ALERT_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Alert categories
export const ALERT_CATEGORIES = {
  SYSTEM: 'system',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  BUSINESS: 'business',
  API: 'api',
  DATABASE: 'database',
  EXTERNAL_SERVICE: 'external_service',
};

// Note: Rate limiting is handled by Sentry's built-in deduplication and fingerprinting

// Core alerting function
export const sendAlert = (alert) => {
  const {
    title,
    message,
    level = ALERT_LEVELS.MEDIUM,
    category = ALERT_CATEGORIES.SYSTEM,
    context = {},
    tags = {},
    fingerprint = null,
  } = alert;

  // Add environment context
  const alertContext = {
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    server: process.env.SERVER_NAME || 'unknown',
    version: process.env.APP_VERSION || 'unknown',
    ...context,
  };

  const alertTags = {
    level,
    category,
    environment: process.env.NODE_ENV || 'development',
    ...tags,
  };

  // Log alert locally
  const logLevel = level === ALERT_LEVELS.CRITICAL ? 'error' : 'warn';
  console[logLevel](`[ALERT:${level.toUpperCase()}] ${title}`, {
    message,
    context: alertContext,
    tags: alertTags,
  });

  // Send to monitoring service with appropriate Sentry level
  const sentryLevel = level === ALERT_LEVELS.CRITICAL ? 'error' : 
                     level === ALERT_LEVELS.HIGH ? 'warning' : 
                     level === ALERT_LEVELS.MEDIUM ? 'warning' : 'info';

  monitoring.captureMessage(`ALERT: ${title}`, sentryLevel, {
    tags: alertTags,
    extra: {
      message,
      ...alertContext,
    },
    fingerprint: fingerprint ? [fingerprint] : undefined,
  });

  // For critical alerts, also capture as exception for better visibility
  if (level === ALERT_LEVELS.CRITICAL) {
    monitoring.captureException(new Error(`Critical Alert: ${title} - ${message}`), {
      tags: alertTags,
      extra: alertContext,
      fingerprint: fingerprint ? [fingerprint] : undefined,
    });
  }
};

// Predefined alert functions for common scenarios
export const systemAlerts = {
  highMemoryUsage: (usage) => sendAlert({
    title: 'High Memory Usage',
    message: `Memory usage is at ${usage}%`,
    level: usage > 90 ? ALERT_LEVELS.CRITICAL : ALERT_LEVELS.HIGH,
    category: ALERT_CATEGORIES.SYSTEM,
    context: { memoryUsage: usage },
    fingerprint: 'system.memory.high',
  }),

  databaseConnectionError: (error) => sendAlert({
    title: 'Database Connection Error',
    message: `Failed to connect to database: ${error.message}`,
    level: ALERT_LEVELS.CRITICAL,
    category: ALERT_CATEGORIES.DATABASE,
    context: { error: error.message, stack: error.stack },
    fingerprint: 'database.connection.error',
  }),

  externalServiceError: (service, error) => sendAlert({
    title: `${service} Service Error`,
    message: `External service ${service} is failing: ${error.message}`,
    level: ALERT_LEVELS.HIGH,
    category: ALERT_CATEGORIES.EXTERNAL_SERVICE,
    context: { service, error: error.message },
    fingerprint: `external.${service}.error`,
  }),

  highErrorRate: (endpoint, errorRate) => sendAlert({
    title: 'High Error Rate Detected',
    message: `Endpoint ${endpoint} has ${errorRate}% error rate`,
    level: errorRate > 50 ? ALERT_LEVELS.CRITICAL : ALERT_LEVELS.HIGH,
    category: ALERT_CATEGORIES.API,
    context: { endpoint, errorRate },
    fingerprint: `api.error_rate.${endpoint}`,
  }),

  authenticationFailures: (count, timeWindow) => sendAlert({
    title: 'Multiple Authentication Failures',
    message: `${count} authentication failures in ${timeWindow} minutes`,
    level: count > 100 ? ALERT_LEVELS.HIGH : ALERT_LEVELS.MEDIUM,
    category: ALERT_CATEGORIES.SECURITY,
    context: { failureCount: count, timeWindow },
    fingerprint: 'security.auth.failures',
  }),

  rateLimitExceeded: (endpoint, ip) => sendAlert({
    title: 'Rate Limit Exceeded',
    message: `Rate limit exceeded for ${endpoint} from ${ip}`,
    level: ALERT_LEVELS.MEDIUM,
    category: ALERT_CATEGORIES.SECURITY,
    context: { endpoint, ip },
    fingerprint: `security.rate_limit.${ip}`,
  }),
};

export const businessAlerts = {
  paymentFailure: (userId, amount, error) => sendAlert({
    title: 'Payment Processing Failure',
    message: `Payment of $${amount} failed for user ${userId}`,
    level: ALERT_LEVELS.HIGH,
    category: ALERT_CATEGORIES.BUSINESS,
    context: { userId, amount, error: error.message },
    fingerprint: 'business.payment.failure',
  }),

  creditSystemError: (userId, operation, error) => sendAlert({
    title: 'Credit System Error',
    message: `Credit operation '${operation}' failed for user ${userId}`,
    level: ALERT_LEVELS.HIGH,
    category: ALERT_CATEGORIES.BUSINESS,
    context: { userId, operation, error: error.message },
    fingerprint: 'business.credits.error',
  }),
};

export const performanceAlerts = {
  slowResponse: (endpoint, responseTime) => sendAlert({
    title: 'Slow Response Time',
    message: `Endpoint ${endpoint} took ${responseTime}ms to respond`,
    level: responseTime > 10000 ? ALERT_LEVELS.HIGH : ALERT_LEVELS.MEDIUM,
    category: ALERT_CATEGORIES.PERFORMANCE,
    context: { endpoint, responseTime },
    fingerprint: `performance.slow.${endpoint}`,
  }),

  highCpuUsage: (usage) => sendAlert({
    title: 'High CPU Usage',
    message: `CPU usage is at ${usage}%`,
    level: usage > 90 ? ALERT_LEVELS.HIGH : ALERT_LEVELS.MEDIUM,
    category: ALERT_CATEGORIES.PERFORMANCE,
    context: { cpuUsage: usage },
    fingerprint: 'performance.cpu.high',
  }),
};

// Health check monitoring
export const healthMonitor = {
  trackEndpointHealth: (endpoint, isHealthy, responseTime) => {
    if (!isHealthy) {
      systemAlerts.highErrorRate(endpoint, 100);
    } else if (responseTime > 5000) {
      performanceAlerts.slowResponse(endpoint, responseTime);
    }
  },

  trackResourceUsage: (resources) => {
    const { memory, cpu, disk } = resources;
    
    if (memory > 85) {
      systemAlerts.highMemoryUsage(memory);
    }
    
    if (cpu > 85) {
      performanceAlerts.highCpuUsage(cpu);
    }
    
    if (disk > 90) {
      sendAlert({
        title: 'High Disk Usage',
        message: `Disk usage is at ${disk}%`,
        level: ALERT_LEVELS.HIGH,
        category: ALERT_CATEGORIES.SYSTEM,
        context: { diskUsage: disk },
        fingerprint: 'system.disk.high',
      });
    }
  },
};

// Rate limiting cleanup removed - handled by Sentry's built-in deduplication

export default {
  sendAlert,
  systemAlerts,
  businessAlerts,
  performanceAlerts,
  healthMonitor,
  ALERT_LEVELS,
  ALERT_CATEGORIES,
};