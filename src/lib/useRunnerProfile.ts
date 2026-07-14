import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { monadTestnet } from "viem/chains";
import {
  parseProfile,
  PROFILE_ABI,
  PROFILE_ADDRESS,
  type OnChainProfile,
} from "./profile";

/**
 * Always re-read MovrProfile after reload / reconnect.
 * stale empty cache was making Profile look blank until Edit opened a fresh fetch.
 */
export function useRunnerProfile(address: `0x${string}` | undefined): {
  profile: OnChainProfile;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
} {
  const enabled = Boolean(address && PROFILE_ADDRESS);

  const { data, isLoading, isFetching, refetch } = useReadContract({
    address: PROFILE_ADDRESS,
    abi: PROFILE_ABI,
    functionName: "getProfile",
    args: address ? [address] : undefined,
    chainId: monadTestnet.id,
    query: {
      enabled,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: true,
    },
  });

  const profile = useMemo(() => parseProfile(data), [data]);

  return {
    profile,
    isLoading: enabled && isLoading,
    isFetching,
    refetch: () => {
      void refetch();
    },
  };
}
