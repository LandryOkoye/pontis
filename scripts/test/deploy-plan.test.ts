import { describe, expect, it } from "vitest";
import { renderDeployments, targets, wasmPath } from "../lib/deploy-plan.ts";
import { REPO_ROOT } from "../lib/evidence.ts";

describe("deploy plan", () => {
  it("deploys core once and the token wasm twice with different metadata", () => {
    const t = targets("pontis.testnet", {
      core: "c.pontis.testnet",
      a: "a.pontis.testnet",
      b: "b.pontis.testnet",
    });
    expect(t.map((x) => x.wasm)).toEqual(["pontis_core", "synthetic_token", "synthetic_token"]);
    expect(t[1]?.init).toMatchObject({
      symbol: "TGOLD-A",
      decimals: 6,
      owner_id: "pontis.testnet",
    });
    expect(t[2]?.init).toMatchObject({ symbol: "TGOLD-B", decimals: 8 });
    expect(String(t[1]?.init.name)).toContain("SYNTHETIC TEST");
  });

  it("finds wasm under target/near or PONTIS_WASM_DIR", () => {
    expect(wasmPath("pontis_core", {})).toBe(
      `${REPO_ROOT}/target/near/pontis_core/pontis_core.wasm`,
    );
    expect(wasmPath("pontis_core", { PONTIS_WASM_DIR: "/w" })).toBe(
      "/w/pontis_core/pontis_core.wasm",
    );
  });

  it("renders a deployments record without any secret", () => {
    const md = renderDeployments({
      networkId: "testnet",
      deployerId: "pontis.testnet",
      date: "2026-11-08",
      rows: [{ label: "pontis-core", accountId: "c.pontis.testnet", codeHash: "ab12" }],
    });
    expect(md).toContain("`c.pontis.testnet`");
    expect(md).toContain("ab12");
    expect(md).not.toMatch(/ed25519:/);
  });
});
