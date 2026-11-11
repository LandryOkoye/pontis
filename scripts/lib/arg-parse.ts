// Argument helpers shared by the operator commands: option splitting and the value formats
// (ids, times, ratios) the contract accepts. Pure, so they are tested through the command parsers.

export interface RatioArg {
  num: string;
  den: string;
}
const ID = /^[a-z0-9]+([_.-][a-z0-9]+)*$/;
export const SHA256 = /^[0-9a-f]{64}$/;

export interface Parsed {
  positionals: string[];
  flags: Map<string, string | true>;
}

/** Splits `--name value` and `--switch`; a name outside `valued` or `switches` is refused. */
export function split(
  argv: string[],
  valued: readonly string[],
  switches: readonly string[] = [],
): Parsed {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    if (flags.has(name)) throw new Error(`--${name} given twice`);
    if (switches.includes(name)) {
      flags.set(name, true);
    } else if (valued.includes(name)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
      flags.set(name, value);
    } else {
      throw new Error(`unknown option --${name}`);
    }
  }
  return { positionals, flags };
}

export function positional(p: Parsed, count: number, what: string): string[] {
  if (p.positionals.length !== count) throw new Error(`expected ${what}`);
  return p.positionals;
}

export function text(p: Parsed, name: string): string {
  const value = p.flags.get(name);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`--${name} is required`);
  return value;
}

export function optional(p: Parsed, name: string): string | undefined {
  const value = p.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function id(value: string, what: string): string {
  if (!ID.test(value)) throw new Error(`${what} must be a lowercase id such as tgold-a`);
  return value;
}

export function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/** Epoch milliseconds, or an ISO 8601 date with an explicit zone ("Z" or an offset). */
export function parseTime(value: string, name: string): number {
  if (/^\d+$/.test(value)) {
    const ms = Number(value);
    if (Number.isSafeInteger(ms)) return ms;
  } else if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms >= 0) return ms;
  }
  throw new Error(`--${name} must be epoch milliseconds or an ISO 8601 date with a zone`);
}

/** `num/den` of two positive integers, sent as strings like every u128 on the wire. */
export function parseRatio(value: string, name: string): RatioArg {
  const match = /^([1-9][0-9]{0,37})\/([1-9][0-9]{0,37})$/.exec(value);
  if (!match || BigInt(match[1]!) >= 1n << 128n || BigInt(match[2]!) >= 1n << 128n) {
    throw new Error(`--${name} must be num/den, two positive integers, such as 2/1`);
  }
  return { num: match[1]!, den: match[2]! };
}
