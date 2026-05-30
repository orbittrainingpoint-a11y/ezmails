import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => {
        // Don't retry auth/permission errors.
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
