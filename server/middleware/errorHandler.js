import { monitoring } from '../lib/monitoring.js';
import { logger } from '../lib/cloudwatch-logger.js';

// Custom error class for API errors
export class APIError extends Error {
  constructor(message, statusCode = 500, code = null, context = {}) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    this.isAPIError = true;
  }
}

// Utility function to create API errors
export const createAPIError = (message, statusCode = 500, code = null, context = {}) => {
  return new APIError(message, statusCode, code, context);
};

// Common API error types
export const API_ERRORS = {
  VALIDATION_ERROR: (message, field) => 
    new APIError(message, 400, 'VALIDATION_ERROR', { field }),
  NOT_FOUND: (resource) => 
    new APIError(`${resource} not found`, 404, 'NOT_FOUND', { resource }),
  UNAUTHORIZED: (message = 'Unauthorized') => 
    new APIError(message, 401, 'UNAUTHORIZED'),
  FORBIDDEN: (message = 'Forbidden') => 
    new APIError(message, 403, 'FORBIDDEN'),
  CONFLICT: (message, resource) => 
    new APIError(message, 409, 'CONFLICT', { resource }),
  RATE_LIMITED: (message = 'Rate limit exceeded') => 
    new APIError(message, 429, 'RATE_LIMITED'),
  INTERNAL_ERROR: (message = 'Internal server error') => 
    new APIError(message, 500, 'INTERNAL_ERROR'),
  BAD_REQUEST: (message, details) => 
    new APIError(message, 400, 'BAD_REQUEST', { details }),
  SERVICE_UNAVAILABLE: (service) => 
    new APIError(`${service} service unavailable`, 503, 'SERVICE_UNAVAILABLE', { service }),
};

// Express error handler middleware
export const errorHandler = (err, req, res, next) => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request context
  const context = {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.userId || null,
    timestamp: new Date().toISOString(),
  };

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let errorDetails = {};

  // Handle different error types
  if (err.isAPIError) {
    // Custom API errors
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    errorDetails = err.context;
  } else if (err.name === 'ValidationError') {
    // Mongoose/validation errors
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    errorDetails = { fields: err.errors };
  } else if (err.name === 'CastError') {
    // Database cast errors (invalid IDs, etc.)
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
    errorDetails = { field: err.path, value: err.value };
  } else if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Resource already exists';
    errorDetails = { constraint: err.constraint };
  } else if (err.code === '23503') {
    // PostgreSQL foreign key constraint violation
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced resource does not exist';
    errorDetails = { constraint: err.constraint };
  } else if (err.code === 'ECONNREFUSED') {
    // Connection refused (database, external service)
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Service temporarily unavailable';
    errorDetails = { address: err.address, port: err.port };
  } else if (err.name === 'JsonWebTokenError') {
    // JWT errors
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    // Expired JWT
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  } else if (err.type === 'entity.parse.failed') {
    // JSON parse errors
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (err.type === 'entity.too.large') {
    // Request too large
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload too large';
  }

  // Log error with context
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  const logMessage = `${logLevel.toUpperCase()}: ${code} - ${message}`;
  
  if (logLevel === 'error') {
    logger.error(logMessage, {
      ...context,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
        ...errorDetails,
      },
      component: 'errorHandler'
    });
  } else {
    logger.warn(logMessage, {
      ...context,
      error: {
        name: err.name,
        message: err.message,
        code: err.code,
        ...errorDetails,
      },
      component: 'errorHandler'
    });
  }

  // Report to monitoring service for 5xx errors and critical 4xx errors
  if (statusCode >= 500 || ['UNAUTHORIZED', 'FORBIDDEN'].includes(code)) {
    const sentryId = monitoring.captureException(err, {
      tags: {
        errorCode: code,
        statusCode: statusCode.toString(),
        endpoint: `${req.method} ${req.route?.path || req.url}`,
      },
      extra: {
        ...context,
        errorDetails,
      },
      user: req.user ? {
        id: req.user.userId,
        username: req.user.handle,
        email: req.user.email,
      } : undefined,
    });
    
    if (sentryId) {
      context.errorId = sentryId;
    }
  }

  // Prepare response based on environment
  const response = {
    error: {
      code,
      message,
      requestId,
      timestamp: context.timestamp,
    },
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    response.error.details = errorDetails;
    response.error.stack = err.stack;
  }

  // Include error ID for production support
  if (context.errorId) {
    response.error.errorId = context.errorId;
    response.error.supportMessage = 'Please include this error ID when contacting support';
  }

  res.status(statusCode).json(response);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req, res, next) => {
  const error = API_ERRORS.NOT_FOUND(`Route ${req.method} ${req.url}`);
  next(error);
};

// Async error wrapper for route handlers
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Express middleware to handle uncaught promise rejections in async routes
export const asyncErrorHandler = (fn) => {
  return (req, res, next) => {
    const result = fn(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch(next);
    }
    return result;
  };
};

// Socket.IO error handler
export const socketErrorHandler = (socket, error, context = {}) => {
  const errorId = monitoring.captureException(error, {
    tags: {
      socketId: socket.id,
      namespace: socket.nsp.name,
      transport: socket.conn.transport.name,
    },
    extra: {
      ...context,
      connected: socket.connected,
      handshake: socket.handshake,
    },
  });

  logger.error('Socket error occurred', {
    socketId: socket.id,
    namespace: socket.nsp.name,
    error: error.message,
    errorId,
    context,
    component: 'socketError'
  });

  // Emit error to client
  socket.emit('error', {
    message: 'An error occurred',
    code: 'SOCKET_ERROR',
    errorId,
    timestamp: new Date().toISOString(),
  });
};

// Process-level error handlers
export const setupProcessErrorHandlers = () => {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception detected', {
      error: error.message,
      stack: error.stack,
      component: 'processError'
    });
    monitoring.captureException(error, {
      tags: { type: 'uncaughtException' },
    });
    
    // Graceful shutdown
    logger.error('Shutting down due to uncaught exception', { component: 'processError' });
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason.toString(),
      promise: promise.toString(),
      component: 'processError'
    });
    monitoring.captureException(new Error(`Unhandled Rejection: ${reason}`), {
      tags: { type: 'unhandledRejection' },
      extra: { reason, promise: promise.toString() },
    });
  });

  // Handle graceful shutdown signals
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`, {
      signal,
      component: 'processError'
    });
    monitoring.captureMessage(`Server shutting down: ${signal}`, 'info');
    
    // Add cleanup logic here if needed
    setTimeout(() => {
      logger.warn('Forcefully shutting down after timeout', { component: 'processError' });
      process.exit(1);
    }, 10000); // Force exit after 10 seconds
    
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};