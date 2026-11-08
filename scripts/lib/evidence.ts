// Evidence references for the seed: the hash is computed from the dossier file content, so
// editing a dossier changes it (ADR 0009).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface NewEvidence {
  uri: string;
  sha256: string;
  provenance: "issuer_provided";
  description: string;
}

/** Evidence for a dossier. The provenance is issuer_provided: the issuers are the project itself. */
export function dossierEvidence(name: string, root: string = REPO_ROOT): NewEvidence {
  const uri = `docs/asset-dossiers/${name}.md`;
  const sha256 = createHash("sha256")
    .update(readFileSync(`${root}/${uri}`))
    .digest("hex");
  return {
    uri,
    sha256,
    provenance: "issuer_provided",
    description:
      "Synthetic test dossier, self-attested by the project. Nothing was checked by a third party.",
  };
}
