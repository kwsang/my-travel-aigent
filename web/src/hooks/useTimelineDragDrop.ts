import { useState, useCallback } from 'react';
import { Event } from '@/types';
import { recalculateTimelineCascade } from '@/components/dashboard/timeline/timelineUtils';

export function useTimelineDragDrop(
  segments: Event[],
  setItinerary: any,
  syncItinerary: any,
  expandedDays: Set<number>,
  setExpandedDays: React.Dispatch<React.SetStateAction<Set<number>>>
) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, index: number | string) => {
    e.preventDefault();
    setDragOverIndex(index);

    // Auto-expand collapsed days when hovering over them
    if (typeof index === 'string' && index.startsWith('day-')) {
      const dayNum = parseInt(index.split('-')[1], 10);
      if (!expandedDays.has(dayNum)) {
        setExpandedDays(prev => {
          const next = new Set(prev);
          next.add(dayNum);
          return next;
        });
      }
    }
  }, [expandedDays, setExpandedDays]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetIndex: number, targetDay: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    // Deep copy to safely mutate nested schedule objects
    const newSegments = structuredClone(segments);
    
    const originalDay = segments[draggedIndex].day;
    const [draggedItem] = newSegments.splice(draggedIndex, 1);
    draggedItem.day = targetDay; // Update day if dragged to a different block

    const insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newSegments.splice(insertIndex, 0, draggedItem);

    recalculateTimelineCascade(newSegments, originalDay, targetDay);

    newSegments.sort((a: Event, b: Event) => {
      if (a.day !== b.day) return a.day - b.day;
      const timeA = a.schedule?.local_start_time ? new Date(a.schedule.local_start_time).getTime() : 0;
      const timeB = b.schedule?.local_start_time ? new Date(b.schedule.local_start_time).getTime() : 0;
      return timeA - timeB;
    });

    setItinerary((prev: any) => ({ ...prev, events: newSegments, is_conflict: false, validation_errors: [] }));
    setDraggedIndex(null);
    setDragOverIndex(null);

    syncItinerary(newSegments);
    window.dispatchEvent(new CustomEvent('travel_aigent_timeline_drag_drop', { detail: { item: draggedItem, originalDay, targetDay, updatedSegments: newSegments } }));
  }, [draggedIndex, segments, setItinerary, syncItinerary]);

  return { draggedIndex, dragOverIndex, handleDragStart, handleDragEnter, handleDragLeave, handleDragEnd, handleDragOver, handleDrop };
}