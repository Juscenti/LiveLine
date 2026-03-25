// ============================================================
// friendsInboxStore — friends list + requests (shared + prefetch)
// One in-flight fetch at a time so tabs prefetch + Friends screen dedupe.
// ============================================================
import { Alert } from 'react-native';
import { create } from 'zustand';
import { friendsApi } from '@/services/api';
import { formatApiError } from '@/utils/apiErrors';

/** Single flight; avoids duplicate /friends calls when tabs prefetch + screen mounts. */
let fetchInFlight: Promise<void> | null = null;

export type FriendsInboxFetchOpts = {
  /**
   * When true, show loading (requests sheet / spinners).
   * When false, refresh in background (e.g. after prefetch already filled strip).
   * Default: true only if there was no data yet (first paint).
   */
  withSpinner?: boolean;
  /** When true, errors are ignored (no alert) — e.g. profile tab background refresh. */
  silent?: boolean;
};

export type FriendsInboxState = {
  friends: unknown[];
  requests: unknown[];
  outgoing: unknown[];
  loading: boolean;
  fetch: (opts?: FriendsInboxFetchOpts) => Promise<void>;
  clear: () => void;
};

function hasAnyRows(s: FriendsInboxState): boolean {
  return s.friends.length > 0 || s.requests.length > 0 || s.outgoing.length > 0;
}

export const useFriendsInboxStore = create<FriendsInboxState>((set, get) => ({
  friends: [],
  requests: [],
  outgoing: [],
  loading: false,

  fetch: async (opts?: FriendsInboxFetchOpts) => {
    if (fetchInFlight) {
      await fetchInFlight;
      return;
    }

    const hadData = hasAnyRows(get());
    const withSpinner = opts?.withSpinner ?? !hadData;
    if (withSpinner) {
      set({ loading: true });
    }

    fetchInFlight = (async () => {
      try {
        const [friendsRes, requestsRes, outgoingRes] = await Promise.all([
          friendsApi.getList(),
          friendsApi.getRequests(),
          friendsApi.getOutgoing(),
        ]);

        set({
          friends: friendsRes.data.data ?? friendsRes.data ?? [],
          requests: requestsRes.data.data ?? requestsRes.data ?? [],
          outgoing: outgoingRes.data.data ?? outgoingRes.data ?? [],
        });
      } catch (e: unknown) {
        if (!opts?.silent) {
          Alert.alert('Failed to load', formatApiError(e));
        }
      } finally {
        set({ loading: false });
        fetchInFlight = null;
      }
    })();

    await fetchInFlight;
  },

  clear: () => {
    fetchInFlight = null;
    set({ friends: [], requests: [], outgoing: [], loading: false });
  },
}));
