import { QueryClient } from "@tanstack/react-query";

// Shared instance so logout can drop the previous account's cached catalog data.
export const queryClient = new QueryClient();
