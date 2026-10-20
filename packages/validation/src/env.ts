import { z } from "zod";

/**
 * Thrown when required configuration is missing or invalid. The message lists
 * variable NAMES only; values are never included (AGENTS.md §11).
 */
export class EnvValidationError extends Error {
  readonly issues: ReadonlyArray<{ name: string; problem: string }>;
  constructor(issues: ReadonlyArray<{ name: string; problem: string }>) {
    super(
      `Invalid environment configuration (${issues.length} issue${issues.length === 1 ? "" : "s"}): ` +
        issues.map((i) => `${i.name} (${i.problem})`).join(", "),
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/** A source of environment values, e.g. `process.env` or `import.meta.env`. */
export type EnvSource = Record<string, string | boolean | undefined>;

/**
 * Validate `source` against `schema`. Returns the typed configuration or throws
 * `EnvValidationError`. Zod issue messages are kept (they describe the rule,
 * such as "expected number"), but the offending value is never echoed.
 */
export function parseEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: EnvSource,
): z.infer<TSchema> {
  // Empty strings count as unset so `KEY=` in a .env file behaves like a missing key.
  const normalized: Record<string, string | boolean | undefined> = {};
  for (const [k, v] of Object.entries(source)) normalized[k] = v === "" ? undefined : v;
  const result = schema.safeParse(normalized);
  if (result.success) return result.data as z.infer<TSchema>;
  const issues = result.error.issues.map((i) => ({
    name: i.path.map(String).join(".") || "(root)",
    problem:
      i.code === "invalid_type" && i.message.toLowerCase().includes("undefined")
        ? "missing"
        : i.message,
  }));
  throw new EnvValidationError(issues);
}

/** "true"/"1"/"yes" → true, "false"/"0"/"no" → false (case-insensitive). */
export const envBoolean = z.union([z.boolean(), z.string()]).transform((v, ctx) => {
  if (typeof v === "boolean") return v;
  const s = v.trim().toLowerCase();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  ctx.addIssue({ code: "custom", message: "expected a boolean (true/false)" });
  return z.NEVER;
});

/** Comma-separated list → trimmed, non-empty strings. */
export const envList = z.string().transform((v) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Integer in a range, from a string. */
export const envPort = z.coerce.number().int().min(1).max(65535);

export const appEnvironment = z.enum(["development", "test", "production"]);

export const logLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

export const httpUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "expected an http(s) URL",
  });
