// Signs in to a local or testnet API with a local key and prints the session (docs/runbooks/auth.md).
// Dev and e2e only: it reads a secret key from the environment or the NEAR CLI credentials, which a
// real operator never does (they sign in with a wallet).
//
//   pnpm --silent --filter @pontis/scripts auth-login --api http://127.0.0.1:3000 [--account <id>] [--token-only]

import { pathToFileURL } from "node:url";
import { login, parseLoginArgs, secretKeyFor } from "./lib/auth-login.ts";

export async function main(argv: string[], env = process.env): Promise<void> {
  const args = parseLoginArgs(argv, env);
  const session = await login({
    apiUrl: args.apiUrl,
    accountId: args.accountId,
    secretKey: secretKeyFor(args, env),
  });
  console.error(
    `signed in as ${session.accountId} (${session.keyType} key, roles: ${session.roles.join(", ") || "none"}); session ends ${session.expiresAt} unless used, hard stop ${session.maxExpiresAt}`,
  );
  console.log(args.tokenOnly ? session.token : JSON.stringify(session, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
