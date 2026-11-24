import api from '../api/client';
import type { Access } from './access';

export interface UnfinishedConversation {
  id: string;
  customerName?: string | null;
  customerPhone: string;
  platform: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

/** Owners are never held; other members are when they answer conversations. */
export const holdsSignOut = (access: Access | null) => Boolean(access && access.role !== 'owner' && access.sections.includes('conversations'));

/** The member's conversations where the customer is waiting on them. Null when the check could not run. */
export async function fetchUnfinished(): Promise<UnfinishedConversation[] | null> {
  try {
    const { data } = await api.get<UnfinishedConversation[]>('/conversations/mine/unfinished');
    return Array.isArray(data) ? data : [];
  } catch {
    return null;
  }
}
