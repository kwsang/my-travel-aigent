import type { components } from './generated-api';

/**
 * API Request/Response Models
 * Used for communication with the FastAPI backend.
 */

export type ItineraryPatchRequest = components['schemas']['ItineraryPatchRequest'];
export type ChatRequest = components['schemas']['ChatRequest'];
export type ChatResponse = components['schemas']['ChatResponse'];