// Writes the generated dossiers of the rich demo catalogue (docs/asset-dossiers) and refreshes the
// index block of its README. Run it after editing scripts/lib/catalogue-rich-*.ts; editing a
// dossier changes its hash, which the seed uses as evidence (ADR 0009). Needs no chain or database.
//
//   pnpm --filter @pontis/scripts gen-dossiers

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { renderDossiers } from "./lib/dossier-files.ts";
import { REPO_ROOT } from "./lib/evidence.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const readme = readFileSync(`${REPO_ROOT}/docs/asset-dossiers/README.md`, "utf8");
  const files = await renderDossiers(readme);
  for (const file of files) writeFileSync(`${REPO_ROOT}/${file.path}`, file.content);
  console.log(`wrote ${files.length} files under docs/asset-dossiers`);
}
