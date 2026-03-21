// ============================================================
// services/conversations.ts — Direct messages via Supabase (RLS)
// ============================================================
import { supabase } from './supabase';

export type ConversationListItem = {
  id: string;
  updated_at: string;
  other_user: {
    id: string;
    username: string;
    display_name: string | null;
    profile_picture_url: string | null;
  };
  last_preview: string;
  last_at: string | null;
};

/**
 * Loads 1:1 threads for the current user + last message preview.
 * Returns [] if not signed in, schema missing, or any error (caller can ignore).
 */
export async function loadConversationList(): Promise<ConversationListItem[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const { data: me, error: meErr } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', session.user.id)
      .maybeSingle();

    if (meErr || !me) return [];

    const myId = me.id as string;

    const { data: convs, error: convErr } = await supabase
      .from('direct_conversations')
      .select('id, lower_user_id, higher_user_id, updated_at')
      .or(`lower_user_id.eq.${myId},higher_user_id.eq.${myId}`)
      .order('updated_at', { ascending: false });

    if (convErr || !convs?.length) return [];

    const convIds = convs.map((c) => c.id as string);

    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, body, image_url, created_at, sender_id')
      .in('conversation_id', convIds)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    const lastByConv = new Map<string, { preview: string; at: string }>();
    for (const m of msgs ?? []) {
      const cid = m.conversation_id as string;
      if (lastByConv.has(cid)) continue;
      const hasImg = !!m.image_url;
      const body = (m.body as string | null)?.trim();
      const preview =
        hasImg && body
          ? `📷 ${body}`
          : hasImg
            ? 'Photo'
            : body || 'Message';
      lastByConv.set(cid, { preview, at: m.created_at as string });
    }

    const otherIds = convs.map((c) =>
      c.lower_user_id === myId ? (c.higher_user_id as string) : (c.lower_user_id as string),
    );

    const { data: others } = await supabase
      .from('users')
      .select('id, username, display_name, profile_picture_url')
      .in('id', otherIds);

    const userById = new Map((others ?? []).map((u) => [u.id as string, u]));

    return convs.map((c) => {
      const oid =
        c.lower_user_id === myId ? (c.higher_user_id as string) : (c.lower_user_id as string);
      const u = userById.get(oid);
      const last = lastByConv.get(c.id as string);
      return {
        id: c.id as string,
        updated_at: c.updated_at as string,
        other_user: {
          id: oid,
          username: (u?.username as string) ?? 'unknown',
          display_name: (u?.display_name as string | null) ?? null,
          profile_picture_url: (u?.profile_picture_url as string | null) ?? null,
        },
        last_preview: last?.preview ?? 'Say hello',
        last_at: last?.at ?? null,
      };
    });
  } catch {
    return [];
  }
}

export type ConversationPeer = {
  id: string;
  username: string;
  display_name: string | null;
  profile_picture_url: string | null;
};

/** Other participant in a 1:1 thread (for chat header). */
export async function loadConversationPeer(conversationId: string): Promise<ConversationPeer | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data: me, error: meErr } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', session.user.id)
      .maybeSingle();

    if (meErr || !me) return null;
    const myId = me.id as string;

    const { data: conv, error: convErr } = await supabase
      .from('direct_conversations')
      .select('lower_user_id, higher_user_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (convErr || !conv) return null;

    const lower = conv.lower_user_id as string;
    const higher = conv.higher_user_id as string;
    const otherId = lower === myId ? higher : lower;

    const { data: u, error: uErr } = await supabase
      .from('users')
      .select('id, username, display_name, profile_picture_url')
      .eq('id', otherId)
      .maybeSingle();

    if (uErr || !u) return null;
    return u as ConversationPeer;
  } catch {
    return null;
  }
}

/** Opens or creates a DM with a friend (RPC enforces friendship). */
export async function getOrCreateDirectConversation(otherUserId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other_user_id: otherUserId,
    });
    if (error || data == null) return null;
    return data as string;
  } catch {
    return null;
  }
}
