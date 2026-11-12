// Renders a route of the real app with fresh providers, against the MSW mock API.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ToastProvider } from "../components/ui/toast.tsx";
import { routes } from "../router.tsx";
import { WalletProvider } from "../wallet/context.tsx";

export function renderApp(path: string, options: { account?: string } = {}) {
  if (options.account) localStorage.setItem("pontis.mock.account", options.account);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <WalletProvider>
          <RouterProvider router={router} />
        </WalletProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, router, user: userEvent.setup() };
}
