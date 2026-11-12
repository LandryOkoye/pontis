// Picks up the result a redirect wallet (MyNearWallet) leaves in the return URL: reports the
// transaction hash for a pending conversion, then shows its status page.
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../components/ui/toast.tsx";
import { api } from "../lib/api.ts";
import { isMock } from "../lib/config.ts";

export function RedirectReturn() {
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const handled = useRef(false);

  useEffect(() => {
    if (isMock || handled.current) return;
    if (!/[?&](transactionHashes|errorCode)=/.test(window.location.search)) return;
    handled.current = true;
    void (async () => {
      const { consumeRedirectResult } = await import("./near-wallet.ts");
      const result = consumeRedirectResult();
      if (!result) return;
      void client.invalidateQueries({ queryKey: ["balance"] });
      if (result.context.kind === "faucet") {
        if (result.txHash)
          toast("success", "Test tokens requested", "The faucet transaction was sent.");
        else
          toast(
            "error",
            "Faucet request not sent",
            result.error ?? "The wallet returned without a transaction.",
          );
        void navigate("/app/wallet", { replace: true });
        return;
      }
      const id = result.context.conversionId;
      if (!id) return;
      if (result.txHash) {
        try {
          await api.markSubmitted(id, result.txHash);
          toast(
            "success",
            "Transaction submitted",
            "Waiting for the contract event to be indexed.",
          );
        } catch (error) {
          toast(
            "error",
            "Could not report the transaction",
            error instanceof Error ? error.message : undefined,
          );
        }
      } else {
        toast(
          "error",
          "Nothing was sent",
          result.error ?? "You declined the request in your wallet.",
        );
      }
      void navigate(`/app/activity/${id}`, { replace: true });
    })();
  }, [navigate, toast, client]);

  return null;
}
