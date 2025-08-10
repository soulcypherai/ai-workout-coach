import React, { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { analytics } from '@/lib/posthog';
import { setUser, addBreadcrumb } from '@/lib/sentry';

/**
 * Custom hook for integrated analytics tracking
 * Automatically syncs user data with PostHog and Sentry
 */
export function useAnalytics() {
  const walletAddress = useSelector((state: RootState) => state.app.walletAddress);

  // Sync user data with analytics services when wallet changes
  useEffect(() => {
    if (walletAddress) {
      // PostHog user identification
      analytics.identify(walletAddress, {
        wallet_address: walletAddress,
        identified_at: new Date().toISOString(),
      });

      // Sentry user context
      setUser({
        id: walletAddress,
        wallet: walletAddress,
      });

      // Track wallet connection
      analytics.walletConnected('unknown', walletAddress);
    }
  }, [walletAddress]);

  // Enhanced tracking functions with automatic breadcrumbs
  const trackEvent = useCallback((event: string, properties?: Record<string, any>) => {
    analytics.track(event, properties);
    addBreadcrumb(`Event: ${event}`, 'analytics', properties);
  }, []);

  const trackPageView = useCallback((pageName: string, properties?: Record<string, any>) => {
    analytics.pageView(pageName, properties);
    addBreadcrumb(`Page: ${pageName}`, 'navigation', properties);
  }, []);

  const trackAvatarInteraction = useCallback((
    action: 'selected' | 'call_started' | 'call_ended',
    avatarId: string,
    metadata?: Record<string, any>
  ) => {
    const eventData = {
      avatar_id: avatarId,
      action,
      ...metadata,
    };

    switch (action) {
      case 'selected':
        analytics.avatarSelected(avatarId, metadata?.avatar_type || 'unknown');
        break;
      case 'call_started':
        analytics.callStarted(avatarId, metadata?.call_id || '');
        break;
      case 'call_ended':
        analytics.callEnded(avatarId, metadata?.call_id || '', metadata?.duration || 0);
        break;
    }

    addBreadcrumb(`Avatar ${action}: ${avatarId}`, 'user-interaction', eventData);
  }, []);

  const trackPointsActivity = useCallback((
    action: 'purchased' | 'spent',
    amount: number,
    metadata?: Record<string, any>
  ) => {
    if (action === 'purchased') {
      analytics.pointsPurchased(amount, metadata?.cost || 0);
    } else {
      analytics.pointsSpent(amount, metadata?.spent_on || 'unknown');
    }

    addBreadcrumb(`Points ${action}: ${amount}`, 'user-interaction', {
      amount,
      ...metadata,
    });
  }, []);

  const trackNavigation = useCallback((fromLocation: string, toLocation: string) => {
    analytics.tabChanged(fromLocation, toLocation);
    addBreadcrumb(`Navigation: ${fromLocation} → ${toLocation}`, 'navigation');
  }, []);

  const trackError = useCallback((error: Error, context?: Record<string, any>) => {
    analytics.userError(error.message, {
      error_name: error.name,
      error_stack: error.stack,
      ...context,
    });
  }, []);

  const trackFeatureUsage = useCallback((feature: string, properties?: Record<string, any>) => {
    analytics.featureUsed(feature, properties);
    addBreadcrumb(`Feature used: ${feature}`, 'user-interaction', properties);
  }, []);

  return {
    // Basic tracking
    track: trackEvent,
    pageView: trackPageView,
    
    // Specific event tracking
    trackAvatarInteraction,
    trackPointsActivity,
    trackNavigation,
    trackError,
    trackFeatureUsage,
    
    // User properties
    setUserProperties: analytics.setUserProperties,
    
    // Direct access to analytics instances
    posthog: analytics,
    
    // User state
    isIdentified: !!walletAddress,
    userId: walletAddress,
  };
}

/**
 * HOC for automatic page tracking
 */
export function withAnalytics<T extends object>(
  Component: React.ComponentType<T>,
  pageName: string,
  additionalProps?: Record<string, any>
) {
  return function AnalyticsWrappedComponent(props: T) {
    const { pageView } = useAnalytics();
    
    useEffect(() => {
      pageView(pageName, additionalProps);
    }, [pageView]);

    return React.createElement(Component, props);
  };
}

/**
 * Custom hook for tracking component mount/unmount
 */
export function useComponentTracking(componentName: string, props?: Record<string, any>) {
  const { track } = useAnalytics();

  useEffect(() => {
    track('component_mounted', {
      component: componentName,
      ...props,
    });

    return () => {
      track('component_unmounted', {
        component: componentName,
        ...props,
      });
    };
  }, [track, componentName, props]);
}