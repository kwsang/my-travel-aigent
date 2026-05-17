import { Car, Utensils, Sparkles, Bed, ClipboardList, Plane, LucideIcon } from 'lucide-react';

export type SegmentType = 'TRANSPORT' | 'DINING' | 'EXPERIENCE' | 'LODGING' | 'LOGISTICS' | 'FLIGHT';

// Map segment types to Lucide icons
export const SegmentIcons: Record<SegmentType, LucideIcon> = {
  TRANSPORT: Car,
  DINING: Utensils,
  EXPERIENCE: Sparkles,
  LODGING: Bed,
  LOGISTICS: ClipboardList,
  FLIGHT: Plane,
};

export const SegmentColors: Record<SegmentType, { bg: string }> = {
  LODGING: { bg: '#ffd07b' }, // Jasmine
  DINING: { bg: '#f43f5e' }, // Sunset Rose
  EXPERIENCE: { bg: '#a855f7' }, // Twilight Purple
  FLIGHT: { bg: '#296eb4' }, // Bright Marine
  TRANSPORT: { bg: '#1789fc' }, // Blue Energy
  LOGISTICS: { bg: '#64748b' }, // Slate Gray
};