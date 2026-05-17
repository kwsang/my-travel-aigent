import { useCallback } from 'react';

export function useTimelineItemEvents(
  absoluteIndex: number,
  day: number,
  isDraggable: boolean,
  activeSegmentIndex: number | null,
  setActiveSegmentIndex: (idx: number | null) => void,
  setHoveredSegmentIndex: ((idx: number | null) => void) | undefined,
  onDragStart: (e: React.DragEvent, index: number) => void,
  onDragEnter: (e: React.DragEvent, index: number) => void,
  onDragLeave: (e: React.DragEvent) => void,
  onDragEnd: (e: React.DragEvent) => void,
  onDragOver: (e: React.DragEvent) => void,
  onDrop: (e: React.DragEvent, targetIndex: number, targetDay: number) => void
) {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (isDraggable) {
      onDragStart(e, absoluteIndex);
    } else {
      e.preventDefault();
    }
  }, [isDraggable, onDragStart, absoluteIndex]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    onDragEnter(e, absoluteIndex);
  }, [onDragEnter, absoluteIndex]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.stopPropagation(); // Prevent fallback drop zone from firing
    onDrop(e, absoluteIndex, day);
  }, [onDrop, absoluteIndex, day]);

  const handleClick = useCallback(() => {
    setActiveSegmentIndex(activeSegmentIndex === absoluteIndex ? null : absoluteIndex);
  }, [activeSegmentIndex, absoluteIndex, setActiveSegmentIndex]);

  const handleMouseEnter = useCallback(() => {
    setHoveredSegmentIndex?.(absoluteIndex);
  }, [setHoveredSegmentIndex, absoluteIndex]);

  const handleMouseLeave = useCallback(() => {
    setHoveredSegmentIndex?.(null);
  }, [setHoveredSegmentIndex]);

  return {
    handleDragStart,
    handleDragEnter,
    handleDragLeave: onDragLeave,
    handleDragEnd: onDragEnd,
    handleDragOver: onDragOver,
    handleDrop,
    handleClick,
    handleMouseEnter,
    handleMouseLeave,
  };
}