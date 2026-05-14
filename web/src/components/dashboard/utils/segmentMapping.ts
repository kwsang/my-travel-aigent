import { Car, Utensils, Sparkles, Bed, ClipboardList, Plane, LucideIcon } from 'lucide-react';

export type SegmentType = 'TRANSPORT' | 'DINING' | 'EXPERIENCE' | 'ACCOMMODATION' | 'LOGISTICS' | 'FLIGHT';

// Map segment types to Lucide icons
export const SegmentIcons: Record<SegmentType, LucideIcon> = {
  TRANSPORT: Car,
  DINING: Utensils,
  EXPERIENCE: Sparkles,
  ACCOMMODATION: Bed,
  LOGISTICS: ClipboardList,
  FLIGHT: Plane,
};

export const SegmentColors: Record<SegmentType, { bg: string }> = {
  ACCOMMODATION: { bg: '#ffd07b' }, // Jasmine
  DINING: { bg: '#b1740f' }, // Copperwood
  EXPERIENCE: { bg: '#fdb833' }, // Sunflower Gold
  FLIGHT: { bg: '#296eb4' }, // Bright Marine
  TRANSPORT: { bg: '#1789fc' }, // Blue Energy
  LOGISTICS: { bg: '#b1740f' }, // Copperwood
};