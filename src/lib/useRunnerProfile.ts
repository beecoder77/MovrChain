import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  parseProfile,
  PROFILE_ABI,
  PROFILE_ADDRESS,
  type OnChainProfile,
} from "./profile";
import { monadPublicClient } from "./monadClient";

/**
 * Read MovrProfile via our HTTP public client (not the wallet RPC).
 * Wallet providers often fail eth_call on the wrong chain / rate-limit — that
 * showed up as "Couldn't reach MovrProfile" even when the contract is live.
 */
export function useRunnerProfile(address: `0x${string}` | undefined): {
  profile: OnChainProfile;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const enabled = Boolean(address && PROFILE_ADDRESS);

  const { data, isPending, isFetching, isError, isFetched, refetch, error } =
    useQuery({
      queryKey: ["movrProfile", PROFILE_ADDRESS, address],
      enabled,
      queryFn: async () => {
        if (!address) throw new Error("No address");
        return monadPublicClient.readContract({
          address: PROFILE_ADDRESS,
          abi: PROFILE_ABI,
          functionName: "getProfile",
          args: [address],
        });
      },
      staleTime: 4_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 6_000),
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    });

  const profile = useMemo(() => parseProfile(data), [data]);
  const isLoading = enabled && isPending && !isFetched && !isError;

  if (import.meta.env.DEV && isError && error) {
    console.warn("[MovrProfile] getProfile failed", {
      contract: PROFILE_ADDRESS,
      address,
      error,
    });
  }

  return {
    profile,
    isLoading,
    isFetching: enabled && isFetching,
    isError: enabled && isError && !profile.exists,
    refetch: () => {
      void refetch();
    },
  };
}
