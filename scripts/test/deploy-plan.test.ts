import { describe, expect, it } from "vitest";
import { REPRESENTATIONS } from "../lib/catalogue.ts";
import {
  catalogueTargets,
  fundingFor,
  renderDeployments,
  targets,
  wasmPath,
} from "../lib/deploy-plan.ts";
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

  it("funds an account by its code size: 0.01 NEAR per byte plus 1 NEAR", () => {
    expect(fundingFor(400_000)).toBe(5n * 10n ** 24n);
    expect(fundingFor(0)).toBe(10n ** 24n);
  });
});

describe("catalogue deploy plan", () => {
  const plan = catalogueTargets("pontis.testnet");

  it("deploys one synthetic-token per catalogue representation under <id>.<deployer>", () => {
    expect(plan).toHaveLength(REPRESENTATIONS.length);
    expect(plan.map((t) => t.accountId)).toContain("tvilla-1.pontis.testnet");
    for (const t of plan) {
      expect(t.wasm).toBe("synthetic_token");
      expect(t.accountId.endsWith(".pontis.testnet")).toBe(true);
      expect(String(t.init.name)).toContain("SYNTHETIC TEST");
    }
  });

  it("initialises each token with its own symbol, decimals and the deployer as owner", () => {
    const villa = plan.find((t) => t.label === "TVILLA-1");
    expect(villa?.init).toMatchObject({
      symbol: "TVILLA-1",
      decimals: 0,
      owner_id: "pontis.testnet",
    });
    expect(plan.find((t) => t.label === "TACME-M")?.init).toMatchObject({ decimals: 8 });
  });

  it("does not collide with the MVP accounts or with each other", () => {
    const mvp = targets("pontis.testnet", { core: "c.x", a: "a.x", b: "b.x" }).map(
      (t) => t.accountId,
    );
    const all = [...mvp, ...plan.map((t) => t.accountId)];
    expect(new Set(all).size).toBe(all.length);
  });
});
