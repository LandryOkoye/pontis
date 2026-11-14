// The NEAR wallet libraries assume two Node globals, `Buffer` and `process.env`, at module load.
// Browsers have neither, so they are provided here, once, before those libraries are imported.
import { Buffer } from "buffer";

const scope = globalThis as { Buffer?: unknown; process?: unknown };
scope.Buffer ??= Buffer;
scope.process ??= { env: {} };
