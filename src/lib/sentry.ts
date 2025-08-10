import * as Sentry from "@sentry/react";
import { createBrowserRouter } from "react-router-dom";

export function initSentry() {
  // Only initialize if DSN is provided
  if (!import.meta.env.VITE_SENTRY_DSN) {
    console.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.1, // 100% in dev, 10% in prod
    // Session Replay
    replaysSessionSampleRate: import.meta.env.DEV ? 1.0 : 0.1, // 100% in dev, 10% in prod
    replaysOnErrorSampleRate: 1.0, // 100% when errors occur
    
    beforeSend(event) {
      // Filter out development noise
      if (import.meta.env.DEV) {
        // Don't send HMR related errors in development
        if (event.exception?.values?.[0]?.value?.includes('HMR')) {
          return null;
        }
      }
      return event;
    },
  });

  // Global error handlers to catch all missed errors
  window.addEventListener('unhandledrejection', (event) => {
    if (isSentryEnabled()) {
      Sentry.captureException(event.reason, {
        tags: { section: 'unhandled_promise' },
        extra: { 
          promise: event.promise,
          reason: event.reason 
        }
      });
    }
  });

  window.addEventListener('error', (event) => {
    if (isSentryEnabled() && event.filename) {
      // Resource loading error (images, scripts, CSS, etc.)
      Sentry.captureException(new Error(`Resource failed to load: ${event.filename}`), {
        tags: { section: 'resource_loading' },
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          message: event.message
        }
      });
    }
  });
}

// Create Sentry-aware router
export const createSentryRouter = createBrowserRouter;

// Error boundary component
export const SentryErrorBoundary = Sentry.ErrorBoundary;

// Safe wrapper functions that handle missing Sentry setup
const isSentryEnabled = () => !!import.meta.env.VITE_SENTRY_DSN;

// Custom error reporting functions
export function captureException(error: Error, context?: Record<string, any>) {
  if (!isSentryEnabled()) {
    // Avoid recursion: log directly to console when Sentry is disabled
    console.error('Error (Sentry disabled)', error, context);
    return;
  }

  Sentry.captureException(error, {
    tags: {
      section: 'custom',
    },
    extra: context,
  });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  if (!isSentryEnabled()) {
    // console.log(`Message (Sentry disabled): [${level}] ${message}`, context);
    return;
  }

  Sentry.captureMessage(message, {
    level,
    tags: {
      section: 'custom',
    },
    extra: context,
  });
}

// Set user context
export function setUser(user: { id: string; wallet?: string; [key: string]: any }) {
  if (!isSentryEnabled()) {
    console.log('User context (Sentry disabled):', user);
    return;
  }

  Sentry.setUser(user);
}

// Add breadcrumb for tracking user actions
export function addBreadcrumb(message: string, category: string = 'user-action', data?: Record<string, any>) {
  if (!isSentryEnabled()) {
    // console.log(`Breadcrumb (Sentry disabled): [${category}] ${message}`, data);
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    data,
  });
}