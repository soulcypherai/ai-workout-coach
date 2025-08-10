import { captureException, addBreadcrumb } from './sentry';

interface ErrorContext {
  section?: string;
  userId?: string;
  [key: string]: any;
}

export const errorLogger = {
  /**
   * Log an error with automatic Sentry reporting
   */
  error: (message: string, error?: Error | unknown, context?: ErrorContext) => {
    console.error(message, error, context);
    
    if (error instanceof Error) {
      captureException(error, context);
    } else if (error) {
      captureException(new Error(`${message}: ${String(error)}`), context);
    } else {
      captureException(new Error(message), context);
    }
    
    // Add breadcrumb for debugging
    addBreadcrumb(message, 'error', context);
  },

  /**
   * Log a warning (console only, no Sentry)
   */
  warn: (message: string, data?: any, context?: ErrorContext) => {
    console.warn(message, data, context);
    addBreadcrumb(message, 'warning', { data, ...context });
  },

  /**
   * Log info with breadcrumb
   */
  info: (message: string, data?: any, context?: ErrorContext) => {
    console.log(message, data, context);
    addBreadcrumb(message, 'info', { data, ...context });
  }
};

// Export individual functions for convenience
export const { error: logError, warn: logWarn, info: logInfo } = errorLogger; 