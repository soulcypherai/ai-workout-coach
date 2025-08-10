// IMPORTANT: This file must be imported first, before any other imports
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Initialize Sentry only if DSN is provided
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      nodeProfilingIntegration(),
      // Add Express integration for proper middleware support
      Sentry.expressIntegration(),
      Sentry.httpIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Enhanced profiling configuration
    profileLifecycle: 'trace',
    
    // PII collection (configurable via environment)
    sendDefaultPii: process.env.SENTRY_SEND_PII === 'true' || process.env.NODE_ENV === 'development',
    
    // Additional configuration for better error tracking
    beforeSend(event) {
      // Filter out development noise in production
      if (process.env.NODE_ENV === 'production') {
        // Don't send certain test/dev related errors
        if (event.exception?.values?.[0]?.value?.includes('ECONNREFUSED')) {
          return null;
        }
      }
      return event;
    },
  });
  
  console.log('📊 Sentry error tracking initialized');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Traces Sample Rate: ${process.env.NODE_ENV === 'production' ? '10%' : '100%'}`);
  console.log(`   Send PII: ${process.env.SENTRY_SEND_PII === 'true' || process.env.NODE_ENV === 'development'}`);
} else {
  console.warn('⚠️  Sentry DSN not configured - error tracking disabled');
  console.log('   Set SENTRY_DSN environment variable to enable error tracking');
}

// Export Sentry for use in other files
export { Sentry };