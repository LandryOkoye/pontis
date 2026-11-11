// Wallet sign-in (ADR 0019): the deployer signs a NEP-413 challenge with its key and gets a session
// with the owner role read from the contract; an account with no role signs in and is refused.
// Sandbox only: it needs the contract's `get_account_roles` view and signs with local keys.

import { ENDPOINTS } from "@pontis/api-types";
import { login } from "../../../../scripts/lib/auth-login.ts";
import { parse, refusal } from "../api.ts";
import { assert, section, step } from "../steps.ts";
import { createUser } from "../wallet.ts";
import type { World } from "../world.ts";

export async function auth(world: World): Promise<void> {
  section("Wallet sign-in");
  const { api, config } = world;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  const operator = await step(
    "the deployer signs in with its key and holds the owner role",
    async () => {
      const session = await login({
        apiUrl: api.baseUrl,
        accountId: config.deployerId,
        secretKey: config.deployerKey,
      });
      assert.equal(session.accountId, config.deployerId);
      assert.equal(session.keyType, "full_access");
      assert.ok(session.roles.includes("owner"), `roles: ${session.roles.join(", ")}`);
      return session;
    },
  );

  await step("/v1/auth/me names the account and its roles", async () => {
    const me = parse(
      await api.get("/v1/auth/me", bearer(operator.token)),
      ENDPOINTS.authMe.response,
    );
    assert.equal(me.accountId, config.deployerId);
    assert.deepEqual(me.roles, operator.roles);
  });

  await step("an admin endpoint answers the session and refuses a call without it", async () => {
    parse(
      await api.get("/v1/admin/reconciliation", bearer(operator.token)),
      ENDPOINTS.getReconciliation.response,
    );
    assert.equal(refusal(await api.get("/v1/admin/reconciliation"), 401), "UNAUTHORIZED");
    assert.equal(
      refusal(await api.get("/v1/admin/reconciliation", bearer("not-a-session-token")), 401),
      "UNAUTHORIZED",
    );
  });

  await step("an account with no role signs in and is refused every admin endpoint", async () => {
    const user = await createUser(world, { allowlisted: false });
    const session = await login({
      apiUrl: api.baseUrl,
      accountId: user.accountId,
      secretKey: user.secretKey,
    });
    assert.deepEqual(session.roles, []);
    for (const path of ["/v1/admin/reconciliation", "/v1/admin/metrics"]) {
      assert.equal(refusal(await api.get(path, bearer(session.token)), 403), "FORBIDDEN");
    }
    // The session itself is valid: it is the role that is missing.
    parse(await api.get("/v1/auth/me", bearer(session.token)), ENDPOINTS.authMe.response);
  });

  await step("logout ends the session at once", async () => {
    const out = await api.post("/v1/auth/logout", {}, bearer(operator.token));
    parse(out, ENDPOINTS.authLogout.response);
    assert.equal(
      refusal(await api.get("/v1/auth/me", bearer(operator.token)), 401),
      "UNAUTHORIZED",
    );
  });
}
