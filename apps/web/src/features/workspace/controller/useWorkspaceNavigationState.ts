'use client';

import { useEffect, useRef, useState } from 'react';

export function useWorkspaceNavigationState() {
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const navigationPreferenceTouchedRef = useRef(false);

  useEffect(() => {
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const syncTabletNavigation = () => {
      if (!navigationPreferenceTouchedRef.current) {
        setIsNavigationCollapsed(tabletQuery.matches);
      }
    };
    syncTabletNavigation();
    tabletQuery.addEventListener('change', syncTabletNavigation);
    return () => tabletQuery.removeEventListener('change', syncTabletNavigation);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const syncMobileViewport = () => {
      setIsMobileViewport(mobileQuery.matches);
      if (!mobileQuery.matches) setIsMobileNavigationOpen(false);
    };
    syncMobileViewport();
    mobileQuery.addEventListener('change', syncMobileViewport);
    return () => mobileQuery.removeEventListener('change', syncMobileViewport);
  }, []);

  return {
    collapsed: isNavigationCollapsed,
    effectiveCollapsed: isNavigationCollapsed && !isMobileNavigationOpen,
    isMobileViewport,
    mobileOpen: isMobileNavigationOpen,
    setCollapsed(collapsed: boolean) {
      navigationPreferenceTouchedRef.current = true;
      setIsNavigationCollapsed(collapsed);
    },
    setMobileOpen: setIsMobileNavigationOpen,
  };
}
