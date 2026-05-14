'use client';

import { useState, useEffect, useRef } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export function useSidebarResize(defaultWidth: number = 400, minWidth: number = 300, maxWidth: number = 800) {
  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('travel_aigent_sidebar_width', defaultWidth);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      // Clamp the sidebar width between minWidth and maxWidth
      const newWidth = Math.max(minWidth, Math.min(e.clientX, maxWidth));
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`;
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging) return;
      setIsDragging(false);
      const finalWidth = Math.max(minWidth, Math.min(e.clientX, maxWidth));
      setSidebarWidth(finalWidth);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setSidebarWidth, minWidth, maxWidth]);

  return { sidebarWidth, isDragging, setIsDragging, sidebarRef };
}