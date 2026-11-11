// The custody, reserve and redemption section of a generated claim dossier (docs/asset-dossiers).
// It states only what the custody data says (scripts/lib/catalogue-custody-*.ts) and says plainly
// that all of it is fictional and simulated: the custodians are invented, the reserves are signed
// by a public dev key, and nothing is custodied, backed, audited, regulated or paid out.

import { custodyFor } from "./catalogue-custody-tiers.ts";
import type { PlannedTerms, ReserveStory } from "./catalogue-custody-types.ts";
import type { CatalogueRepresentation } from "./catalogue.ts";
import { table } from "./dossier-format.ts";

const DAY_MS = 86_400_000;

const STORY_TEXT: Record<ReserveStory, string> = {
  healthy: "attested above supply: the state is `ok`",
  thin: "attested a little below supply but inside the tolerance: `ok`, with no headroom",
  breached:
    "attested below supply and the tolerance: the route is restricted (`reserve_restricted`) while it lasts",
  stale:
    "attested once with a 5 minute max age and not refreshed: `ok` for minutes, then the route is restricted (`reserve_stale`). The story decays by design",
  warn_only:
    "attested below supply, but the policy only warns: the status says `breached`, nothing is refused",
  pause_mint: "the policy action is `pause_mint`: a breach would also stop gated mints",
  never_attested:
    "a policy and a link exist but no attestation was ever made: `no_attestation`, the route is restricted",
};

const duration = (ms: number) => (ms % DAY_MS === 0 ? `${ms / DAY_MS} d` : `${ms / 60_000} min`);

function termsText(t: PlannedTerms): string {
  const window = t.window
    ? `open ${duration(t.window.lengthMs)} in every ${duration(t.window.periodMs)}`
    : "always open";
  const max = t.maxWhole === 0n ? "no maximum" : `at most ${t.maxWhole}`;
  return `at least ${t.minWhole} and ${max} whole tokens, fee ${t.feeBps} bps, ${window}, issuer accepts within ${duration(t.acceptWithinMs)} and settles within ${t.settlementDays} d (simulated)`;
}

/** The section for the representations of one claim, or an empty string when there are none. */
export function custodySection(reps: readonly CatalogueRepresentation[]): string {
  if (reps.length === 0) return "";
  const { custodians, custody, terms, redemptions } = custodyFor("full");
  const blocks = reps.map((rep) => {
    const link = custody.find((c) => c.representationId === rep.id);
    const custodian = custodians.find((c) => c.id === link?.custodianId);
    const t = terms.find((x) => x.representationId === rep.id);
    const done = redemptions.find((r) => r.representationId === rep.id);
    const rows: string[][] = [];
    if (link && custodian) {
      rows.push(
        [
          "Custodian (invented)",
          `${custodian.name}, \`${custodian.id}\`, ${custodian.jurisdiction}`,
        ],
        ["Structure", `\`${link.structure}\``],
        ["Reserve story", `\`${link.story}\`: ${STORY_TEXT[link.story]}`],
        [
          "Reserve policy",
          `\`${link.policy.action}\`, tolerance ${link.policy.toleranceBps} bps, max age ${duration(link.policy.maxReserveAgeMs)}`,
        ],
        [
          "Simulated cover",
          link.coverBps === null
            ? "none (never attested)"
            : `${link.coverBps} bps of supply, signed by the public dev key`,
        ],
        ["Seeded by", `\`--catalogue=${link.tier === "demo" ? "demo|full" : "full"}\``],
      );
    }
    rows.push(["Redemption terms", t ? termsText(t) : "none: not redeemable in this demo"]);
    if (done) {
      rows.push([
        "Simulated redemption",
        `${done.amountWhole} whole tokens left \`${done.state}\` by the seed (the issuer is a test account; nothing is paid out)`,
      ]);
    }
    const empty = link
      ? ""
      : `\nNo custody is recorded for \`${rep.id}\`: the custody screens show their empty state, which is intended.\n`;
    return `### \`${rep.id}\`\n${empty}\n${table(["Field", "Value"], rows)}`;
  });
  return `## Custody, reserves and redemption (simulated)

> **FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.**
> Every custodian is invented and every reserve figure is attested by a simulated custodian holding a public dev key (\`pontis-reserve-v1\`). Nothing is custodied, backed, audited, regulated or paid out, and nothing here is evidence of any of those. Seeded by \`seed-custody\` ([ADR 0020](../decisions/0020-custody-reserves-and-redemption.md)).

${blocks.join("\n\n")}
`;
}
