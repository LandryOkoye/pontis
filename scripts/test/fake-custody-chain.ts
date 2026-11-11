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

/** `supplies` maps a token account to its total supply. */
export function fakeCustodyChain(supplies: Record<string, bigint> = {}) {
  const calls: Call[] = [];
  const roles = new Map<string, Set<string>>();
  const keys: { account_id: string; public_key: string; scopes: string[] }[] = [];
  const custodians = new Map<string, Json>();
  const links = new Map<string, Json>();
  const policies = new Map<string, Json>();
  const has = (role: string, account: string) => roles.get(role)?.has(account) ?? false;

  const views: Record<string, (args: Json, contract: string) => unknown> = {
    has_role: (a) => has(a.role as string, a.account_id as string),
    get_signer_keys: () => keys,
    get_custodian: (a) => custodians.get(a.id as string) ?? null,
    get_custody_link: (a) => links.get(a.representation_id as string) ?? null,
    get_reserve_policy: (a) => policies.get(a.representation_id as string) ?? null,
    ft_total_supply: (_a, contract) => (supplies[contract] ?? 0n).toString(),
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
        policies.set(rep, policy);
        return;
      }
      default:
        return fail(`unexpected core call ${method}`);
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
        return contract === CORE ? applyCore(method, args, signer) : fail(`unknown ${contract}`);
      },
    }) as unknown as Chain;

  return {
    chain: chainFor(DEPLOYER),
    calls,
    roles,
    methods: () => calls.map((c) => c.method),
    /** Gives the deployer the registrar role, as the catalogue seed does before the custody seed. */
    withRegistrar() {
      roles.set("registrar", new Set([DEPLOYER]));
      return this;
    },
  };
}
