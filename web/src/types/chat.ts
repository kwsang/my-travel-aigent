/**
 * Shared Chat Types
 */

export interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  thought?: string;
  is_conflict?: boolean;
}