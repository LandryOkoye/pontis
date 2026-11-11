import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devKey } from "@pontis/dev-keys";
import { parseReserveAttestation, reserveAttestationMessage } from "@pontis/market-data";
import { createPublicKey, verify } from "node:crypto";
import { base58Decode } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import {
  addSignerKeyArgs,
  linkCustodyArgs,
  parseReservesArgs,
  registerCustodianArgs,
  setReservePolicyArgs,
  type ReservesCommand,
} from "../lib/reserve-ops.ts";
import { discoverTargets, tokenSupply, type View } from "../lib/reserve-chain.ts";
import {
  coverFor,
  loadCoverState,
  nextAsOfMs,
  parseCoverState,
  reservedUnitsFor,
  reserveSubmission,
  saveCoverState,
  serializeCoverState,
  syntheticReport,
} from "../lib/reserve-publish.ts";

const HASH = "ab".repeat(32);
const NOW = Date.UTC(2026, 10, 11, 12, 0, 7);
const KEY = devKey("reserve-attester").publicKey;

/** The command narrowed to `kind`, or a failure naming what the parser returned instead. */
function only<K extends ReservesCommand["kind"]>(
  kind: K,
  command: ReservesCommand,
): Extract<ReservesCommand, { kind: K }> {
  if (command.kind !== kind) throw new Error(`expected ${kind}, got ${command.kind}`);
  return command as Extract<ReservesCommand, { kind: K }>;
}

describe("reserves arguments", () => {
  it("parses register-custodian into the exact register_custodian argument", () => {
    const command = parseReservesArgs([
      "register-custodian",
      "vault-co-sim",
      "--name",
      "Meridian Vault Co (SYNTHETIC)",
      "--jurisdiction",
      "CH",
    ]);
    expect(registerCustodianArgs(only("register-custodian", command))).toEqual({
      custodian: {
        id: "vault-co-sim",
        name: "Meridian Vault Co (SYNTHETIC)",
        jurisdiction: "CH",
        attester_key: KEY,
        synthetic: true,
        verification_status: "unverified",
        evidence: [],
      },
    });
  });

  it("takes evidence only as a whole and only with a real hash", () => {
    const base = ["register-custodian", "vault-co-sim", "--name", "x (SYNTHETIC)"];
    const command = parseReservesArgs([
      ...base,
      "--verification",
      "issuer_attested",
      "--evidence-uri",
      "sim://custodians/vault-co-sim",
      "--evidence-sha256",
      HASH,
      "--evidence-description",
      "Synthetic test record, self-attested by the project",
    ]);
    expect(command).toMatchObject({
      verification: "issuer_attested",
      evidence: [
        { uri: "sim://custodians/vault-co-sim", sha256: HASH, provenance: "issuer_provided" },
      ],
    });
    expect(() => parseReservesArgs([...base, "--evidence-uri", "x"])).toThrow(/go together/);
    expect(() =>
      parseReservesArgs([
        ...base,
        "--evidence-uri",
        "x",
        "--evidence-sha256",
        "nope",
        "--evidence-description",
        "d",
      ]),
    ).toThrow(/64 lowercase hex/);
    expect(() => parseReservesArgs([...base, "--verification", "independently_verified"])).toThrow(
      /one of/,
    );
  });

  it("parses link into link_custody and limits it to 1 to 4 distinct custodians", () => {
    const command = parseReservesArgs(["link", "tgold-a", "segregated", "vault-co-sim", "b-co"]);
    expect(linkCustodyArgs(only("link", command))).toEqual({
      representation_id: "tgold-a",
      structure: "segregated",
      custodian_ids: ["vault-co-sim", "b-co"],
    });
    expect(() => parseReservesArgs(["link", "tgold-a", "segregated"])).toThrow(/expected/);
    expect(() => parseReservesArgs(["link", "tgold-a", "vault", "a-co"])).toThrow(/one of/);
    expect(() => parseReservesArgs(["link", "tgold-a", "omnibus", "a-co", "a-co"])).toThrow(
      /distinct/,
    );
    expect(() =>
      parseReservesArgs(["link", "tgold-a", "omnibus", "a", "b", "c", "d", "e"]),
    ).toThrow(/1 to 4/);
  });

  it("parses set-policy into set_reserve_policy with the contract's ranges", () => {
    const command = parseReservesArgs([
      "set-policy",
      "tgold-a",
      "--action",
      "restrict_conversions",
      "--tolerance-bps",
      "50",
    ]);
    expect(setReservePolicyArgs(only("set-policy", command))).toEqual({
      representation_id: "tgold-a",
      policy: {
        tolerance_bps: 50,
        max_reserve_age_ms: 86_400_000,
        action: "restrict_conversions",
        baseline_supply: "0",
      },
    });
    const policy = (...extra: string[]) =>
      parseReservesArgs(["set-policy", "tgold-a", "--action", "warn", ...extra]);
    expect(() => policy("--tolerance-bps", "1001")).toThrow(/0 to 1000/);
    expect(() => policy("--max-age-ms", "59999")).toThrow(/60000/);
    expect(() => policy("--max-age-ms", "2592000001")).toThrow(/2592000000/);
    expect(() => policy("--baseline-supply", "-1")).toThrow(/decimal/);
    expect(() => parseReservesArgs(["set-policy", "tgold-a"])).toThrow(/--action is required/);
    expect(() => parseReservesArgs(["set-policy", "tgold-a", "--action", "freeze"])).toThrow(
      /one of/,
    );
  });

  it("registers the dev reserve-attester key for the reserves scope by default", () => {
    const command = parseReservesArgs(["register-attester", "custodian-sim.testnet"]);
    expect(addSignerKeyArgs(only("register-attester", command))).toEqual({
      role: "reserve_attester",
      account_id: "custodian-sim.testnet",
      public_key: KEY,
      scopes: ["reserves"],
    });
    expect(() =>
      parseReservesArgs(["register-attester", "a.testnet", "--scopes", "reserves,bridge"]),
    ).toThrow(/one of/);
  });

  it("parses grant-role, set-minter, status and drift", () => {
    expect(parseReservesArgs(["grant-role", "registrar", "reg.testnet"])).toEqual({
      kind: "grant-role",
      role: "registrar",
      accountId: "reg.testnet",
    });
    expect(() => parseReservesArgs(["grant-role", "owner", "x.testnet"])).toThrow(/one of/);
    expect(parseReservesArgs(["set-minter", "tgold-a"])).toEqual({
      kind: "set-minter",
      representationId: "tgold-a",
    });
    expect(parseReservesArgs(["status"])).toEqual({ kind: "status", representationId: null });
    expect(parseReservesArgs(["drift", "tgold-a", "9000"])).toEqual({
      kind: "drift",
      representationId: "tgold-a",
      coverBps: 9000,
    });
    expect(parseReservesArgs(["drift", "tgold-a", "clear"])).toMatchObject({ coverBps: null });
    expect(() => parseReservesArgs(["drift", "tgold-a", "-5"])).toThrow(/integer/);
    expect(() => parseReservesArgs(["drift", "tgold-a", "1e3"])).toThrow(/integer/);
  });

  it("parses publish with its defaults and flags", () => {
    expect(parseReservesArgs(["publish"])).toEqual({
      kind: "publish",
      loop: false,
      intervalMs: 30_000,
      coverBps: 10_000,
      custodianId: null,
      skip: [],
    });
    expect(
      parseReservesArgs([
        "publish",
        "--loop",
        "--interval-ms",
        "5000",
        "--cover-bps",
        "9500",
        "--custodian",
        "vault-co-sim",
        "--skip",
        "tgold-b",
        "--skip",
        "tgold-a",
      ]),
    ).toEqual({
      kind: "publish",
      loop: true,
      intervalMs: 5000,
      coverBps: 9500,
      custodianId: "vault-co-sim",
      skip: ["tgold-b", "tgold-a"],
    });
    expect(() => parseReservesArgs(["publish", "--skip"])).toThrow(/needs a value/);
    expect(() => parseReservesArgs(["publish", "--interval-ms", "10"])).toThrow(/1000/);
    expect(() => parseReservesArgs(["publish", "--cover-bps", "100001"])).toThrow(/100000/);
    expect(() => parseReservesArgs(["publish", "extra"])).toThrow(/expected/);
  });

  it("lists --skip in the usage and refuses it with no value or a bad id", () => {
    expect(() => parseReservesArgs(["bogus"])).toThrow(/--skip <representation>/);
    expect(() => parseReservesArgs(["publish", "--skip", "Bad Id"])).toThrow(/representation/);
  });

  it("prints the usage for an unknown command", () => {
    expect(() => parseReservesArgs([])).toThrow(/usage: reserves/);
    expect(() => parseReservesArgs(["mint"])).toThrow(/SIMULATED/);
  });
});

describe("simulated custodian", () => {
  const target = {
    representationId: "tgold-a",
    tokenId: "tgold-a.pontis.testnet",
    custodianId: "vault-co-sim",
  };

  it("floors supply times cover", () => {
    expect(reservedUnitsFor(1_000_000n, 10_000)).toBe(1_000_000n);
    expect(reservedUnitsFor(1_000_001n, 9_999)).toBe(999_900n); // floor(999 900.9999)
    expect(reservedUnitsFor(3n, 5_000)).toBe(1n);
    expect(reservedUnitsFor(0n, 10_000)).toBe(0n);
    expect(reservedUnitsFor(10n, 0)).toBe(0n);
    expect(reservedUnitsFor(1n << 99n, 20_000)).toBe(1n << 100n);
    expect(() => reservedUnitsFor((1n << 99n) + 1n, 20_000)).toThrow(/2\^100/);
    expect(() => reservedUnitsFor(1n, 100_001)).toThrow(RangeError);
  });

  it("builds a labelled, signed submission in the exact arguments of the contract", () => {
    const s = reserveSubmission(target, 5_000_000n, 10_000, NOW, "core.testnet");
    expect(s.args.attestation).toEqual({
      version: 1,
      contract: "core.testnet",
      representation_id: "tgold-a",
      custodian_id: "vault-co-sim",
      reserved_units: "5000000",
      as_of_ms: NOW,
      report_hash: syntheticReport("tgold-a", "vault-co-sim", NOW, 5_000_000n).hash,
      report_uri: "sim://reserves/tgold-a/2026-11",
      simulated: true,
      source: "simulated_custodian",
    });
    expect(s.args.attestation.report_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.args.public_key).toBe(KEY);
    // The signature verifies against the message the contract rebuilds.
    const message = reserveAttestationMessage(parseReserveAttestation(s.args.attestation));
    const spki = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(base58Decode(KEY.slice("ed25519:".length))),
    ]);
    const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
    expect(verify(null, message, pub, Buffer.from(s.args.signature, "base64"))).toBe(true);
  });

  it("covers less when drifted, and says so in the figure", () => {
    const s = reserveSubmission(target, 5_000_000n, 9_000, NOW, "core.testnet");
    expect(s.args.attestation.reserved_units).toBe("4500000");
    expect(s.coverBps).toBe(9_000);
  });

  it("always signs a strictly newer time for the same pair", () => {
    expect(nextAsOfMs(NOW, undefined)).toBe(NOW);
    expect(nextAsOfMs(NOW, NOW - 5)).toBe(NOW);
    expect(nextAsOfMs(NOW, NOW)).toBe(NOW + 1);
    expect(nextAsOfMs(NOW, NOW + 10)).toBe(NOW + 11);
  });

  it("names the report as synthetic with a month-stamped sim:// URI within the contract limits", () => {
    const report = syntheticReport("tgold-a", "vault-co-sim", NOW, 1n);
    expect(report.text).toMatch(/^SIMULATED/);
    expect(report.uri).toBe("sim://reserves/tgold-a/2026-11");
    expect(report.uri.length).toBeLessThanOrEqual(256);
    expect("simulated_custodian".length).toBeLessThanOrEqual(64);
    expect(syntheticReport("tgold-a", "vault-co-sim", NOW, 2n).hash).not.toBe(report.hash);
  });
});

describe("cover state", () => {
  it("round-trips through the file and lets a drift override the default", () => {
    const dir = mkdtempSync(join(tmpdir(), "reserves-"));
    try {
      const path = join(dir, "state.json");
      expect(loadCoverState(path)).toEqual({});
      saveCoverState(path, { "tgold-b": 8000, "tgold-a": 9000 });
      expect(loadCoverState(path)).toEqual({ "tgold-a": 9000, "tgold-b": 8000 });
      expect(coverFor(loadCoverState(path), "tgold-a", 10_000)).toBe(9000);
      expect(coverFor(loadCoverState(path), "tgold-c", 10_000)).toBe(10_000);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("is labelled simulated and refuses a damaged file instead of resetting it", () => {
    expect(JSON.parse(serializeCoverState({ "tgold-a": 9000 }))).toEqual({
      simulated: true,
      cover_bps: { "tgold-a": 9000 },
    });
    expect(() => parseCoverState('{"cover_bps":{"tgold-a":"x"}}')).toThrow(/integer/);
    expect(() => parseCoverState('{"cover_bps":{"tgold-a":-1}}')).toThrow(/integer/);
    expect(() => parseCoverState("not json")).toThrow();
  });
});

describe("discovery", () => {
  const reps = [
    { id: "tgold-a", account_id: "tgold-a.pontis.testnet", issuer_id: "meridian-sim" },
    { id: "tgold-b", account_id: "tgold-b.pontis.testnet", issuer_id: "meridian-sim" },
    { id: "tbond-a", account_id: "tbond-a.pontis.testnet", issuer_id: "meridian-sim" },
    { id: "tfund-a", account_id: "tfund-a.pontis.testnet", issuer_id: "meridian-sim" },
  ];
  const world: Record<string, Record<string, unknown>> = {
    get_reserve_status: {
      "tgold-a": { monitored: true, state: "ok" },
      "tgold-b": { monitored: true, state: "no_attestation" },
      "tbond-a": { monitored: false, state: "unmonitored" },
      "tfund-a": { monitored: true, state: "ok" },
    },
    get_custody_link: {
      "tgold-a": { custodian_ids: ["vault-co-sim", "other-co"] },
      "tgold-b": { custodian_ids: ["vault-co-sim"] },
      "tfund-a": null,
    },
    get_custodian: {
      "vault-co-sim": { id: "vault-co-sim", status: "active", attester_key: KEY },
      "other-co": { id: "other-co", status: "active", attester_key: "ed25519:other" },
    },
  };
  const view: View = async <T>(_contract: string, method: string, args = {}) => {
    const a = args as { representation_id?: string; id?: string };
    return world[method]?.[(a.representation_id ?? a.id)!] as T | undefined;
  };

  it("targets monitored, linked representations with an active custodian that holds our key", async () => {
    const { targets, skipped } = await discoverTargets(view, "core.testnet", reps, KEY);
    expect(targets).toEqual([
      {
        representationId: "tgold-a",
        tokenId: "tgold-a.pontis.testnet",
        custodianId: "vault-co-sim",
      },
      {
        representationId: "tgold-b",
        tokenId: "tgold-b.pontis.testnet",
        custodianId: "vault-co-sim",
      },
    ]);
    expect(skipped).toEqual([
      "tgold-a/other-co: custodian is registered with another key",
      "tbond-a: no reserve policy (unmonitored)",
      "tfund-a: no custody link",
    ]);
  });

  it("leaves a representation named in skip alone, so its story is not refreshed", async () => {
    const { targets, skipped } = await discoverTargets(view, "core.testnet", reps, KEY, null, [
      "tgold-a",
    ]);
    expect(targets.map((t) => t.representationId)).toEqual(["tgold-b"]);
    expect(skipped).toContain("tgold-a: skipped by --skip");
  });

  it("narrows to one custodian and skips a suspended one", async () => {
    const only = await discoverTargets(view, "core.testnet", reps, KEY, "other-co");
    expect(only.targets).toEqual([]);
    const record = { id: "vault-co-sim", status: "suspended", attester_key: KEY };
    world.get_custodian!["vault-co-sim"] = record;
    const suspended = await discoverTargets(view, "core.testnet", reps, KEY);
    expect(suspended.targets).toEqual([]);
    expect(suspended.skipped).toContain("tgold-a/vault-co-sim: custodian is not active");
  });

  it("reads the real token supply and refuses anything but a decimal string", async () => {
    const supply: View = async <T>() => "123456789" as T;
    expect(await tokenSupply(supply, "tgold-a.pontis.testnet")).toBe(123_456_789n);
    const bad: View = async <T>() => 5 as T;
    await expect(tokenSupply(bad, "tgold-a.pontis.testnet")).rejects.toThrow(/ft_total_supply/);
  });
});
