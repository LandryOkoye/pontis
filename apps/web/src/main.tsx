import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "./components/ui/toast.tsx";
import { isMock } from "./lib/config.ts";
import { shouldRetry } from "./lib/queries.ts";
import { createRouter } from "./router.tsx";
import "./styles/app.css";
import { WalletProvider } from "./wallet/context.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: shouldRetry, refetchOnWindowFocus: false },
  },
});

async function start() {
  if (isMock) await (await import("./mocks/browser.ts")).startMockApi();
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <RouterProvider router={createRouter()} />
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
