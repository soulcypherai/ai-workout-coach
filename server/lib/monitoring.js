// Centralized monitoring utilities
import { Sentry } from '../instrument.js';

// Safe Sentry operations that handle cases where Sentry isn't initialized
const isSentryEnabled = () => !!process.env.SENTRY_DSN;

export const monitoring = {
  // Safe exception capture
  captureException: (error, context = {}) => {
    if (isSentryEnabled()) {
      return Sentry.captureException(error, context);
    } else {
      // Fallback: just log to console
      console.error('Exception (Sentry disabled):', error, context);
      return null;
    }
  },

  // Safe message capture
  captureMessage: (message, level = 'info', context = {}) => {
    if (isSentryEnabled()) {
      return Sentry.captureMessage(message, { level, ...context });
    } else {
      console.log(`Message (Sentry disabled): [${level}] ${message}`, context);
      return null;
    }
  },

  // Safe span creation
  startSpan: (spanConfig, callback) => {
    if (isSentryEnabled()) {
      return Sentry.startSpan(spanConfig, callback);
    } else {
      // Just execute the callback without span tracking
      return callback();
    }
  },

  // Safe user context setting
  setUser: (user) => {
    if (isSentryEnabled()) {
      return Sentry.setUser(user);
    } else {
      console.log('User context (Sentry disabled):', user);
      return null;
    }
  },

  // Safe breadcrumb addition
  addBreadcrumb: (breadcrumb) => {
    if (isSentryEnabled()) {
      return Sentry.addBreadcrumb(breadcrumb);
    } else {
      console.log('Breadcrumb (Sentry disabled):', breadcrumb);
      return null;
    }
  },

  // Check if monitoring is enabled
  isEnabled: isSentryEnabled,
};

// Convenience functions for specific use cases
export const captureError = (error, context, functionName, metadata = {}) => {
  return monitoring.captureException(error, {
    tags: {
      context,
      function: functionName,
      ...metadata.tags,
    },
    extra: {
      ...metadata,
    },
  });
};

export const trackSpan = (name, operation, attributes, callback) => {
  return monitoring.startSpan({
    name,
    op: operation,
    attributes,
  }, callback);
};