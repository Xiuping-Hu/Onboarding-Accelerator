'use client';

import { useEffect, useRef } from 'react';

export function useWorkspaceRouteFocus(pathname: string) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (previousPathname === pathname) return;

    const frame = window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return headingRef;
}
