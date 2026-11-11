// A stateful fake of pontis-core for the custody seed tests: it answers the views the seed reads and
// applies its calls, enforcing the rules the seed must respect (registrar/attester separation, a
// custodian needs a registered key). NOT the contract: the sandbox run checks the real behaviour.

import type { Chain } from "../lib/chain.ts";

export const CORE = "core.pontis.testnet";
export const DEPLOYER = "pontis.testnet";

export interface Call {
  contract: string;
  method: string;
  args: Record<string, unknown>;
  signer: string;
}
type Json = Record<string, unknown>;

const fail = (message: string): never => {
  throw new Error(message);
};

/** `supplies` maps a token account to its total supply; `clock` is the chain's block time. */
export function fakeCustodyChain(supplies: Record<string, bigint> = {}) {
  const clock = { now: 1_800_000_000_000 };
  const calls: Call[] = [];
  const roles = new Map<string, Set<string>>();
  const keys: { account_id: string; public_key: string; scopes: string[] }[] = [];
  const custodians = new Map<string, Json>();
  const links = new Map<string, Json>();
  const policies = new Map<string, Json>();
  const ledger = new Map<string, bigint>();
  const attestations = new Map<string, Json>();
  const terms = new Map<string, Json>();
  const tokens = new Map(
    Object.entries(supplies).map(([account, supply]) => [
      account,
      {
        rep: account.split(".")[0]!,
        supply,
        minter: null as string | null,
        balances: new Map<string, bigint>([[DEPLOYER, supply]]),
        registered: new Set<string>(),
      },
    ]),
  );
  type Token = NonNullable<ReturnType<typeof tokens.get>>;
  const tokenOfRep = (rep: string) => [...tokens.values()].find((t) => t.rep === rep)!;
  const has = (role: string, account: string) => roles.get(role)?.has(account) ?? false;

  /** The reserve status as the contract computes it on read (reserve_status.rs). */
  function status(rep: string) {
    const policy = policies.get(rep);
    if (!policy) return { monitored: false, state: "unmonitored", oldest_as_of_ms: null };
    const ids = (links.get(rep)?.custodian_ids as string[] | undefined) ?? [];
    const records = ids.flatMap((c) => attestations.get(`${rep}|${c}`) ?? []);
    const attested = records.reduce((sum, r) => sum + BigInt(r.reserved_units as string), 0n);
    const limit = attested + (attested * BigInt(policy.tolerance_bps as number)) / 10_000n;
    const oldest = records.length ? Math.min(...records.map((r) => r.as_of_ms as number)) : null;
    const age = oldest === null ? 0 : clock.now - oldest;
    const state =
      oldest === null
        ? "no_attestation"
        : (ledger.get(rep) ?? 0n) > limit
          ? "breached"
          : age > (policy.max_reserve_age_ms as number)
            ? "stale"
            : "ok";
    return { monitored: true, state, oldest_as_of_ms: oldest, attested_units: attested.toString() };
  }

  const views: Record<string, (args: Json, contract: string) => unknown> = {
    has_role: (a) => has(a.role as string, a.account_id as string),
    get_signer_keys: () => keys,
    get_custodian: (a) => custodians.get(a.id as string) ?? null,
    get_custody_link: (a) => links.get(a.representation_id as string) ?? null,
    get_reserve_policy: (a) => policies.get(a.representation_id as string) ?? null,
    get_reserve_status: (a) => status(a.representation_id as string),
    get_reserve_attestation: (a) =>
      attestations.get(`${a.representation_id}|${a.custodian_id}`) ?? null,
    ft_total_supply: (_a, contract) => tokens.get(contract)!.supply.toString(),
    ft_balance_of: (a, c) => (tokens.get(c)!.balances.get(a.account_id as string) ?? 0n).toString(),
    get_minter: (_a, contract) => tokens.get(contract)!.minter,
    storage_balance_of: (a, c) =>
      tokens.get(c)!.registered.has(a.account_id as string) ? { total: "1" } : null,
    get_redemption_terms: (a) => terms.get(a.representation_id as string) ?? null,
  };

  function applyCore(method: string, args: Json, signer: string): unknown {
    switch (method) {
      case "grant_role": {
        const [role, account] = [args.role as string, args.account_id as string];
        if (role === "reserve_attester" && has("registrar", account)) fail("separation: registrar");
        if (role === "registrar" && has("reserve_attester", account)) fail("separation: attester");
        roles.set(role, (roles.get(role) ?? new Set()).add(account));
        return;
      }
      case "add_signer_key":
        if (!has(args.role as string, args.account_id as string)) fail("account lacks the role");
        keys.push({
          account_id: args.account_id as string,
          public_key: args.public_key as string,
          scopes: args.scopes as string[],
        });
        return;
      case "register_custodian": {
        const c = args.custodian as Json;
        if (!keys.some((k) => k.public_key === c.attester_key && k.scopes.includes("reserves"))) {
          fail("key is not a registered reserve attester key");
        }
        if (!has("registrar", signer)) fail("registrar only");
        custodians.set(c.id as string, { ...c, status: "active" });
        return;
      }
      case "link_custody":
        for (const id of args.custodian_ids as string[]) {
          if (!custodians.has(id)) fail("custodian not found or not active");
        }
        links.set(args.representation_id as string, args);
        return;
      case "set_reserve_policy": {
        const rep = args.representation_id as string;
        const policy = args.policy as Json;
        const old = policies.get(rep);
        if (old && old.baseline_supply !== policy.baseline_supply) fail("baseline_supply fixed");
        if (!old) ledger.set(rep, BigInt(policy.baseline_supply as string));
        policies.set(rep, policy);
        return;
      }
      case "submit_reserve_attestation": {
        const a = args.attestation as Json;
        const key = `${a.representation_id}|${a.custodian_id}`;
        const link = links.get(a.representation_id as string);
        if (!(link?.custodian_ids as string[] | undefined)?.includes(a.custodian_id as string)) {
          fail("custodian not linked");
        }
        if (
          ((attestations.get(key)?.as_of_ms as number | undefined) ?? 0) >= (a.as_of_ms as number)
        ) {
          fail("not newer than the stored attestation");
        }
        attestations.set(key, a);
        return;
      }
      case "set_redemption_terms": {
        const rep = args.representation_id as string;
        const version = ((terms.get(rep)?.version as number | undefined) ?? 0) + 1;
        const terms_hash = `${rep}${version}`.padEnd(64, "0").replace(/[^0-9a-f]/g, "a");
        terms.set(rep, { terms: args.terms, version, terms_hash: terms_hash.slice(0, 64) });
        return;
      }
      default:
        return fail(`unexpected core call ${method}`);
    }
  }

  function applyToken(t: Token, method: string, args: Json, signer: string): unknown {
    switch (method) {
      case "set_minter":
        t.minter = (args.minter as string | null) ?? null;
        return;
      case "storage_deposit":
        t.registered.add(args.account_id as string);
        return;
      default:
        return fail(`unexpected token call ${method}`);
    }
  }

  const chainFor = (signer: string): Chain =>
    ({
      config: {
        coreId: CORE,
        deployerId: DEPLOYER,
        deployerKey: "ed25519:fake",
        networkId: "sandbox",
      },
      view: async (contract: string, method: string, args: Json = {}) =>
        (views[method] ?? fail(`unexpected view ${method}`))(args, contract),
      call: async (contract: string, method: string, args: Json = {}) => {
        calls.push({ contract, method, args, signer });
        const token = tokens.get(contract);
        if (token) return applyToken(token, method, args, signer);
        return contract === CORE ? applyCore(method, args, signer) : fail(`unknown ${contract}`);
      },
    }) as unknown as Chain;

  return {
    chain: chainFor(DEPLOYER),
    tokenOf: tokenOfRep,
    terms,
    calls,
    clock,
    status,
    roles,
    methods: () => calls.map((c) => c.method),
    /** Gives the deployer the registrar role, as the catalogue seed does before the custody seed. */
    withRegistrar() {
      roles.set("registrar", new Set([DEPLOYER]));
      return this;
    },
  };
}
