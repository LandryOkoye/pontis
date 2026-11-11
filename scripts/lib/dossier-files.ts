// Renders every generated dossier and the index block of docs/asset-dossiers/README.md from the
// catalogue data, formatted with the repository's prettier config so `prettier --check .` passes.
// `pnpm --filter @pontis/scripts gen-dossiers` writes them; a test compares the committed files
// with this output, so a dossier cannot drift from the data (ADR 0009: the dossier's hash is the
// evidence, and editing a dossier needs new evidence on chain).

import { format, resolveConfig } from "prettier";
import { categoryLabel, repStatus, table } from "./dossier-format.ts";
import { claimDossier } from "./dossier-claim.ts";
import { issuerDossier } from "./dossier-issuer.ts";
import { catalogueFor, richFor } from "./catalogue-tiers.ts";
import { REPO_ROOT } from "./evidence.ts";

export const INDEX_BEGIN = "<!-- BEGIN generated: rich catalogue (scripts/gen-dossiers.ts) -->";
export const INDEX_END = "<!-- END generated: rich catalogue -->";
const DIR = "docs/asset-dossiers";

export interface RenderedFile {
  /** Repository-relative path. */
  path: string;
  content: string;
}

async function pretty(path: string, text: string): Promise<string> {
  const config = (await resolveConfig(`${REPO_ROOT}/${path}`)) ?? {};
  return format(text, { ...config, parser: "markdown" });
}

function indexBlock(): string {
  const full = catalogueFor("full");
  const rich = richFor("full");
  const repsOf = (field: "issuerId" | "claimId", id: string) =>
    full.representations
      .filter((r) => r[field] === id)
      .map((r) => `\`${r.id}\``)
      .join(", ") || "none";
  const claims = rich.claims.map((c) => [
    `[${c.dossier}](${c.dossier}.md)`,
    `\`${c.id}\``,
    categoryLabel(c.category),
    `\`${c.tier}\``,
    repsOf("claimId", c.id),
  ]);
  const issuers = rich.issuers.map((i) => {
    const reps = full.representations.filter((r) => r.issuerId === i.id);
    const states = [...new Set(reps.map((r) => repStatus(r, i)))].join(", ");
    return [
      `[${i.dossier}](${i.dossier}.md)`,
      `\`${i.id}\``,
      i.jurisdiction,
      `\`${i.finalStatus}\``,
      `\`${i.verification}\``,
      `\`${i.tier}\``,
      reps.length === 0 ? "none" : `${repsOf("issuerId", i.id)} (${states})`,
    ];
  });
  return `${INDEX_BEGIN}

## Rich demo catalogue (\`--catalogue=demo\` and \`--catalogue=full\`)

${rich.issuers.length} more invented issuers in ${new Set(rich.issuers.map((i) => i.jurisdiction)).size} jurisdictions and ${rich.claims.length} more claims, [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md) section 3. **All of it is fictional demo data:** every name, domain (under the reserved \`.example\` suffix) and ticker is invented and imitates no real company, fund or token; jurisdictions are real places used as plain facts; nothing is licensed, backed or verified, and the custody, reserve and redemption sections of the claim dossiers describe a simulation (invented custodians, a public dev signer), not custody. These dossiers are generated from [\`scripts/lib/catalogue-rich-*.ts\`](../../scripts/lib) by \`pnpm --filter @pontis/scripts gen-dossiers\`, and a test fails if one drifts from the data. The \`tier\` column is the smallest tier that includes the record: \`demo\` records are in both tiers, \`full\` records only in \`full\`; \`mvp\` seeds none of them.

Claims, each the evidence of its claim and of the relationships between its wrappers:

${table(["Dossier", "Canonical asset", "Category", "Tier", "Representations"], claims)}

Issuers, each the evidence of the issuer and of its representations (record status in brackets):

${table(["Dossier", "Issuer", "Jurisdiction", "Status after seeding", "`verification_status`", "Tier", "Representations"], issuers)}

The statuses are what the seed leaves on chain. The stories behind them (a lapsed attestation, a suspension, a pending review, a failed review, a delisting, a split scheduled in a dossier only, a redemption-gated note) are narrative: the contract has no attestation expiry, no review process and no delisting without two accounts, only a registrar moving a record between statuses.

${INDEX_END}`;
}

/** The README with its generated block replaced (or appended before "Writing a dossier"). */
export function withIndexBlock(readme: string): string {
  const block = indexBlock();
  const begin = readme.indexOf(INDEX_BEGIN);
  const end = readme.indexOf(INDEX_END);
  if (begin !== -1 && end !== -1)
    return readme.slice(0, begin) + block + readme.slice(end + INDEX_END.length);
  const anchor = readme.indexOf("## Writing a dossier");
  if (anchor === -1)
    throw new Error("README has no 'Writing a dossier' section to place the block before");
  return `${readme.slice(0, anchor)}${block}\n\n${readme.slice(anchor)}`;
}

/** Every generated dossier plus the updated README, formatted. */
export async function renderDossiers(readme: string): Promise<RenderedFile[]> {
  const full = catalogueFor("full");
  const rich = richFor("full");
  const files: RenderedFile[] = [
    ...rich.issuers.map((i) => ({
      path: `${DIR}/${i.dossier}.md`,
      content: issuerDossier(i, full),
    })),
    ...rich.claims.map((c) => ({ path: `${DIR}/${c.dossier}.md`, content: claimDossier(c, full) })),
    { path: `${DIR}/README.md`, content: withIndexBlock(readme) },
  ];
  return Promise.all(files.map(async (f) => ({ ...f, content: await pretty(f.path, f.content) })));
}
