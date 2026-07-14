import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useReconnect } from "wagmi";
import App from "./App";
import { wagmiConfig } from "./lib/wagmi";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: true,
    },
  },
});

/** Re-attach injected wallet after hard refresh so profile reads fire again */
function WalletReconnect({ children }: { children: React.ReactNode }) {
  const { reconnect } = useReconnect();
  useEffect(() => {
    void reconnect();
  }, [reconnect]);
  return children;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WalletReconnect>
          <App />
        </WalletReconnect>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
