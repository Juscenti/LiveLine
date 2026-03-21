// ============================================================
// services/conversations.ts — Direct messages via Supabase (RLS)
// ============================================================
import type { RealtimeChannel } from '@supabase/supabase-js';
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

export type GetOrCreateConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; message: string };

/** Opens or creates a DM with a friend (RPC enforces friendship). */
export async function getOrCreateDirectConversation(
  otherUserId: string,
): Promise<GetOrCreateConversationResult> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      p_other_user_id: otherUserId,
    });
    if (error) {
      return { ok: false, message: error.message ?? 'Could not open chat' };
    }
    if (data == null) return { ok: false, message: 'Could not open chat' };
    return { ok: true, conversationId: data as string };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Could not open chat',
    };
  }
}

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
};

async function getMyPublicUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data: me } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', session.user.id)
    .maybeSingle();
  return (me?.id as string) ?? null;
}

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, image_url, created_at')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data as ChatMessage[];
}

export async function sendTextMessage(conversationId: string, body: string): Promise<ChatMessage | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const myId = await getMyPublicUserId();
  if (!myId) return null;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: myId,
      body: trimmed,
    })
    .select('id, conversation_id, sender_id, body, image_url, created_at')
    .single();

  if (error || !data) return null;
  return data as ChatMessage;
}

/** Subscribe to new rows in this conversation (Realtime publication must include `messages`). */
export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: (row: ChatMessage) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`dm:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessage;
        if ((row as { is_deleted?: boolean }).is_deleted) return;
        onInsert(row);
      },
    )
    .subscribe();

  return channel;
}

export async function unsubscribeChannel(channel: RealtimeChannel) {
  await supabase.removeChannel(channel);
}
