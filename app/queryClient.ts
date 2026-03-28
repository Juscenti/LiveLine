// ============================================================
// Shared React Query client (used by root layout + auth wipe)
// ============================================================
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});
