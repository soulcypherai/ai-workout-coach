import posthog from 'posthog-js';
import React from 'react';

export function initPostHog() {
  if (typeof window !== 'undefined' && import.meta.env.VITE_POSTHOG_API_KEY) {
    posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      person_profiles: 'identified_only', // Only create profiles for identified users
      capture_pageview: false, // We'll capture pageviews manually with React Router
      capture_pageleave: true, // Track when users leave pages
      loaded: (posthog) => {
        if (import.meta.env.DEV) posthog.debug(); // Debug mode in development
      }
    });
  } else if (typeof window !== 'undefined') {
    console.warn('PostHog API key not configured - analytics disabled');
  }
}

// Safe wrapper for PostHog operations
const isPostHogEnabled = () => {
  return typeof window !== 'undefined' && 
         import.meta.env.VITE_POSTHOG_API_KEY && 
         posthog.__loaded;
};

const safePostHogCall = (operation: string, fn: () => void, fallbackLog?: any) => {
  if (isPostHogEnabled()) {
    try {
      fn();
    } catch (error) {
      console.warn(`PostHog ${operation} failed:`, error);
    }
  } else if (fallbackLog !== undefined) {
    console.log(`Analytics (PostHog disabled): ${operation}`, fallbackLog);
  }
};

// Custom event tracking functions
export const analytics = {
  // User actions
  identify: (userId: string, properties?: Record<string, any>) => {
    safePostHogCall('identify', () => posthog.identify(userId, properties), { userId, properties });
  },

  // Page views (manual since we disabled auto-capture)
  pageView: (path: string, properties?: Record<string, any>) => {
    const eventData = {
      $current_url: typeof window !== 'undefined' ? window.location.href : '',
      path,
      ...properties,
    };
    safePostHogCall('pageView', () => posthog.capture('$pageview', eventData), eventData);
  },

  // Avatar interactions
  avatarSelected: (avatarId: string, avatarType: string) => {
    const eventData = { avatar_id: avatarId, avatar_type: avatarType };
    safePostHogCall('avatarSelected', () => posthog.capture('avatar_selected', eventData), eventData);
  },

  callStarted: (avatarId: string, callId: string) => {
    const eventData = { avatar_id: avatarId, call_id: callId };
    safePostHogCall('callStarted', () => posthog.capture('call_started', eventData), eventData);
  },

  callEnded: (avatarId: string, callId: string, duration: number) => {
    const eventData = { avatar_id: avatarId, call_id: callId, duration_seconds: duration };
    safePostHogCall('callEnded', () => posthog.capture('call_ended', eventData), eventData);
  },

  // Wallet interactions
  walletConnected: (walletType: string, address: string) => {
    const eventData = { wallet_type: walletType, wallet_address: address };
    safePostHogCall('walletConnected', () => posthog.capture('wallet_connected', eventData), eventData);
  },

  walletDisconnected: () => {
    safePostHogCall('walletDisconnected', () => posthog.capture('wallet_disconnected'), 'wallet_disconnected');
  },

  // Points system
  pointsPurchased: (amount: number, cost: number) => {
    const eventData = { points_amount: amount, cost_usd: cost };
    safePostHogCall('pointsPurchased', () => posthog.capture('points_purchased', eventData), eventData);
  },

  pointsSpent: (amount: number, action: string) => {
    const eventData = { points_amount: amount, spent_on: action };
    safePostHogCall('pointsSpent', () => posthog.capture('points_spent', eventData), eventData);
  },

  // Navigation
  tabChanged: (fromTab: string, toTab: string) => {
    const eventData = { from_tab: fromTab, to_tab: toTab };
    safePostHogCall('tabChanged', () => posthog.capture('tab_changed', eventData), eventData);
  },

  // Errors (custom error tracking beyond Sentry)
  userError: (error: string, context?: Record<string, any>) => {
    const eventData = { error_message: error, ...context };
    safePostHogCall('userError', () => posthog.capture('user_error', eventData), eventData);
  },

  // Feature usage
  featureUsed: (feature: string, properties?: Record<string, any>) => {
    const eventData = { feature_name: feature, ...properties };
    safePostHogCall('featureUsed', () => posthog.capture('feature_used', eventData), eventData);
  },

  // Generic event capture
  track: (eventName: string, properties?: Record<string, any>) => {
    safePostHogCall('track', () => posthog.capture(eventName, properties), { eventName, properties });
  },

  // Set user properties
  setUserProperties: (properties: Record<string, any>) => {
    safePostHogCall('setUserProperties', () => posthog.setPersonProperties(properties), properties);
  },

  // Group analytics (for cohort analysis)
  group: (groupType: string, groupKey: string, properties?: Record<string, any>) => {
    const eventData = { groupType, groupKey, properties };
    safePostHogCall('group', () => posthog.group(groupType, groupKey, properties), eventData);
  },
};

// React hook for PostHog
export function usePostHog() {
  return posthog;
}

// HOC for automatic page view tracking
export function withPageTracking<T extends object>(
  Component: React.ComponentType<T>,
  pageName: string,
) {
  return function TrackedComponent(props: T) {
    React.useEffect(() => {
      analytics.pageView(pageName);
    }, []);

    return <Component {...props} />;
  };
}

// Type definitions for better TypeScript support
export type AnalyticsEvent = keyof typeof analytics;
export type EventProperties = Record<string, string | number | boolean | null>;