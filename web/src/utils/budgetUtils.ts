import { BUDGET_CONFIG } from '@/config/constants';
import { Event } from '@/types';

interface BudgetMetricsParams {
  segments: Event[];
  budget?: any; // Type as TripBudget if available in your types
  partySize: number;
  profile?: any; // Type as TravelerProfile if available in your types
  viewMode: 'total' | 'per_person';
}

export function calculateBudgetMetrics({
  segments,
  budget,
  partySize,
  profile,
  viewMode
}: BudgetMetricsParams) {
  const totalCost = segments.reduce((acc, s) => acc + (s.details?.price?.amount || 0), 0);
  const rawLimit = budget?.total_limit || 0;
  const currency = budget?.currency || BUDGET_CONFIG.DEFAULT_CURRENCY;

  // Determine if the profile's budget limit was entered as a per-person limit
  const isPerPersonProfile = profile?.preferences?.group_planning_per_person || false;
  const actualPartySize = Math.max(BUDGET_CONFIG.MIN_PARTY_SIZE, partySize);

  // Calculate the absolute total and per person limits based on the profile's intent
  const absoluteTotalLimit = isPerPersonProfile ? rawLimit * actualPartySize : rawLimit;
  const absolutePerPersonLimit = isPerPersonProfile ? rawLimit : rawLimit / actualPartySize;

  const displayTotal = viewMode === 'total' ? totalCost : totalCost / actualPartySize;
  const displayLimit = viewMode === 'total' ? absoluteTotalLimit : absolutePerPersonLimit;

  const percentage = absoluteTotalLimit > 0 ? (totalCost / absoluteTotalLimit) * 100 : 0;
  const isOverThreshold = percentage >= BUDGET_CONFIG.WARNING_THRESHOLD;

  return { rawLimit, currency, displayTotal, displayLimit, percentage, isOverThreshold };
}