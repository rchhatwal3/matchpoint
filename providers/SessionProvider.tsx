import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase, supabaseEnabled } from '@/lib/supabase';
import type { Category, Item, MatchRow, Member, Room } from '@/lib/types';
import seedData from '@/data/seed.json';

/**
 * Offline dev mode (no Supabase env): seed items get stable local ids and
 * swipes live in memory for the session. Solo — no partner, no matches.
 */
const OFFLINE_ITEMS: Item[] = (
  seedData as { category: string; title: string; subtitle?: string; source?: string }[]
).map((row, i) => ({
  id: `seed-${i}`,
  category: row.category as Category,
  title: row.title,
  subtitle: row.subtitle ?? null,
  image_url: null,
  location: null,
  source: row.source ?? null,
}));

const OFFLINE_ROOM: Room = { id: 'offline-room', code: 'OFFLNE', locations: [] };

type SessionValue = {
  loading: boolean;
  /** True when running without Supabase env vars (seed data, in-memory swipes). */
  offline: boolean;
  userId: string | null;
  room: Room | null;
  member: Member | null;
  partner: Member | null;
  /** Mutual like detected — MatchOverlay renders it wherever it happens. */
  pendingMatch: Item | null;
  dismissMatch: () => void;
  createRoom: (name: string) => Promise<string>;
  joinRoom: (code: string, name: string) => Promise<void>;
  getItems: (category: Category) => Promise<Item[]>;
  getMySwipedItemIds: () => Promise<Set<string>>;
  recordSwipe: (item: Item, liked: boolean) => Promise<void>;
  getMatches: () => Promise<MatchRow[]>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [partner, setPartner] = useState<Member | null>(null);
  const [pendingMatch, setPendingMatch] = useState<Item | null>(null);

  // Offline state — in-memory swipes for the session.
  const offlineSwipes = useRef<Map<string, boolean>>(new Map());
  // Items already announced as matches, so realtime + local checks never double-fire.
  const seenMatchIds = useRef<Set<string>>(new Set());

  const announceMatch = useCallback((item: Item) => {
    if (seenMatchIds.current.has(item.id)) return;
    seenMatchIds.current.add(item.id);
    setPendingMatch(item);
  }, []);

  // ---- Bootstrap: anonymous session + existing member/room/partner ----
  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      // Offline dev mode: fake identity, no room until "created".
      setUserId('offline-user');
      setLoading(false);
      return;
    }
    const client = supabase;
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await client.auth.getSession();
        let user = sessionData.session?.user ?? null;
        if (!user) {
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw error;
          user = data.user;
        }
        if (cancelled || !user) return;
        setUserId(user.id);

        const { data: me } = await client
          .from('members')
          .select('id, room_id, display_name, joined_at')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled || !me) return;
        setMember(me as Member);

        const [{ data: r }, { data: others }] = await Promise.all([
          client
            .from('rooms')
            .select('id, code, locations, created_at')
            .eq('id', me.room_id)
            .maybeSingle(),
          client
            .from('members')
            .select('id, room_id, display_name, joined_at')
            .eq('room_id', me.room_id)
            .neq('id', user.id),
        ]);
        if (cancelled) return;
        if (r) setRoom(r as Room);
        if (others && others.length > 0) setPartner(others[0] as Member);
      } catch (e) {
        console.warn('session bootstrap failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Realtime: partner joins the room ----
  useEffect(() => {
    if (!supabase || !room || !member || partner) return;
    const client = supabase;
    const channel = client
      .channel(`members-${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'members', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const row = payload.new as Member;
          if (row.id !== member.id) setPartner(row);
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [room, member, partner]);

  // ---- Realtime: partner swipes -> mutual-like match detection ----
  useEffect(() => {
    if (!supabase || !partner || !member) return;
    const client = supabase;
    const myId = member.id;
    const channel = client
      .channel(`swipes-${partner.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'swipes', filter: `member_id=eq.${partner.id}` },
        async (payload) => {
          const row = payload.new as { item_id: string; liked: boolean };
          if (!row.liked) return;
          // Partner just liked item — did I like it too?
          const { data: mine } = await client
            .from('swipes')
            .select('liked')
            .eq('member_id', myId)
            .eq('item_id', row.item_id)
            .maybeSingle();
          if (!mine?.liked) return;
          const { data: item } = await client
            .from('items')
            .select('id, category, title, subtitle, image_url, location, source')
            .eq('id', row.item_id)
            .maybeSingle();
          if (item) announceMatch(item as Item);
        },
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [partner, member, announceMatch]);

  // ---- Actions ----
  const createRoom = useCallback(
    async (name: string): Promise<string> => {
      if (!supabase) {
        // Offline: fake room, you are the only member.
        setRoom(OFFLINE_ROOM);
        setMember({ id: 'offline-user', room_id: OFFLINE_ROOM.id, display_name: name });
        return OFFLINE_ROOM.code;
      }
      const { data: code, error } = await supabase.rpc('create_room', { p_name: name });
      if (error) throw error;
      const { data: me } = await supabase
        .from('members')
        .select('id, room_id, display_name, joined_at')
        .eq('id', userId as string)
        .maybeSingle();
      if (me) {
        setMember(me as Member);
        const { data: r } = await supabase
          .from('rooms')
          .select('id, code, locations, created_at')
          .eq('id', me.room_id)
          .maybeSingle();
        if (r) setRoom(r as Room);
      }
      return code as string;
    },
    [userId],
  );

  const joinRoom = useCallback(
    async (code: string, name: string): Promise<void> => {
      if (!supabase) {
        setRoom({ ...OFFLINE_ROOM, code: code.toUpperCase() });
        setMember({ id: 'offline-user', room_id: OFFLINE_ROOM.id, display_name: name });
        return;
      }
      const { data: roomId, error } = await supabase.rpc('join_room', {
        p_code: code,
        p_name: name,
      });
      if (error) throw error;
      const [{ data: r }, { data: allMembers }] = await Promise.all([
        supabase
          .from('rooms')
          .select('id, code, locations, created_at')
          .eq('id', roomId as string)
          .maybeSingle(),
        supabase
          .from('members')
          .select('id, room_id, display_name, joined_at')
          .eq('room_id', roomId as string),
      ]);
      if (r) setRoom(r as Room);
      for (const m of (allMembers ?? []) as Member[]) {
        if (m.id === userId) setMember(m);
        else setPartner(m);
      }
    },
    [userId],
  );

  const getItems = useCallback(async (category: Category): Promise<Item[]> => {
    if (!supabase) return OFFLINE_ITEMS.filter((i) => i.category === category);
    const { data, error } = await supabase
      .from('items')
      .select('id, category, title, subtitle, image_url, location, source')
      .eq('category', category);
    if (error) throw error;
    return (data ?? []) as Item[];
  }, []);

  const getMySwipedItemIds = useCallback(async (): Promise<Set<string>> => {
    if (!supabase) return new Set(offlineSwipes.current.keys());
    if (!member) return new Set();
    const { data } = await supabase.from('swipes').select('item_id').eq('member_id', member.id);
    return new Set(((data ?? []) as { item_id: string }[]).map((s) => s.item_id));
  }, [member]);

  const recordSwipe = useCallback(
    async (item: Item, liked: boolean): Promise<void> => {
      if (!supabase) {
        offlineSwipes.current.set(item.id, liked);
        return; // solo offline — matches impossible
      }
      if (!member) return;
      const { error } = await supabase
        .from('swipes')
        .upsert({ member_id: member.id, item_id: item.id, liked });
      if (error) throw error;
      if (!liked || !partner) return;
      // I just liked it — had my partner already?
      const { data: theirs } = await supabase
        .from('swipes')
        .select('liked')
        .eq('member_id', partner.id)
        .eq('item_id', item.id)
        .maybeSingle();
      if (theirs?.liked) announceMatch(item);
    },
    [member, partner, announceMatch],
  );

  const getMatches = useCallback(async (): Promise<MatchRow[]> => {
    if (!supabase) return []; // offline is solo: no mutual likes possible
    if (!room) return [];
    const { data, error } = await supabase
      .from('room_matches')
      .select('item_id, category, title, subtitle, image_url')
      .eq('room_id', room.id);
    if (error) throw error;
    return (data ?? []) as MatchRow[];
  }, [room]);

  const dismissMatch = useCallback(() => setPendingMatch(null), []);

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      offline: !supabaseEnabled,
      userId,
      room,
      member,
      partner,
      pendingMatch,
      dismissMatch,
      createRoom,
      joinRoom,
      getItems,
      getMySwipedItemIds,
      recordSwipe,
      getMatches,
    }),
    [
      loading,
      userId,
      room,
      member,
      partner,
      pendingMatch,
      dismissMatch,
      createRoom,
      joinRoom,
      getItems,
      getMySwipedItemIds,
      recordSwipe,
      getMatches,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
