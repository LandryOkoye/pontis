import type { ComponentType } from "react";
import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";
import { PageSkeleton, Shell } from "./components/shell.tsx";
import { RedirectReturn } from "./wallet/redirect-return.tsx";

/** Lazy route for one named export of a page module. */
const page = <T, K extends keyof T>(load: () => Promise<T>, name: K) =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));

const Landing = page(() => import("./pages/landing.tsx"), "Landing");
const Overview = page(() => import("./pages/overview.tsx"), "Overview");
const Assets = page(() => import("./pages/assets.tsx"), "Assets");
const AssetDetail = page(() => import("./pages/asset-detail.tsx"), "AssetDetail");
const Issuers = page(() => import("./pages/issuers.tsx"), "Issuers");
const IssuerDetail = page(() => import("./pages/issuers.tsx"), "IssuerDetail");
const Compare = page(() => import("./pages/compare.tsx"), "Compare");
const Convert = page(() => import("./pages/convert.tsx"), "Convert");
const ActivityPage = page(() => import("./pages/activity.tsx"), "Activity");
const TransactionPage = page(() => import("./pages/transaction.tsx"), "TransactionPage");
const WalletPage = page(() => import("./pages/wallet.tsx"), "WalletPage");
const Reconciliation = page(() => import("./pages/reconciliation.tsx"), "Reconciliation");
const NotFound = page(() => import("./pages/not-found.tsx"), "NotFound");

function Root() {
  return (
    <>
      <RedirectReturn />
      <Suspense
        fallback={
          <div className="p-8">
            <PageSkeleton />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </>
  );
}

export const routes = [
  {
    element: <Root />,
    children: [
      { path: "/", element: <Landing /> },
      {
        path: "/app",
        element: <Shell />,
        children: [
          { index: true, element: <Overview /> },
          { path: "assets", element: <Assets /> },
          { path: "assets/:id", element: <AssetDetail /> },
          { path: "issuers", element: <Issuers /> },
          { path: "issuers/:id", element: <IssuerDetail /> },
          { path: "compare", element: <Compare /> },
          { path: "convert", element: <Convert /> },
          { path: "activity", element: <ActivityPage /> },
          { path: "activity/:id", element: <TransactionPage /> },
          { path: "wallet", element: <WalletPage /> },
          { path: "reconciliation", element: <Reconciliation /> },
          { path: "*", element: <NotFound /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
