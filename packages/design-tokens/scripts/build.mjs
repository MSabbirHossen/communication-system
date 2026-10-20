// Generates dist/tokens.css, dist/tokens.js and dist/tokens.d.ts from tokens.json.
// CSS custom properties are prefixed `--cs-`. Theme colors are emitted three ways:
//   :root                      light values (default)
//   [data-theme="dark"]        explicit dark
//   @media (prefers-color-scheme: dark) :root:not([data-theme="light"])  system dark
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{ [key: string]: TokenValue }} TokenGroup */
/** @typedef {string | number | boolean | TokenGroup} TokenValue */
/** @typedef {[name: string, value: string]} Pair */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
/** @type {TokenGroup} */
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));

/** @param {string} s */
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
/** @param {string} k */
const isMeta = (k) => k.startsWith("$") || k === "derived";

/**
 * Flatten non-color groups into [name, value] pairs.
 * @param {TokenValue} obj
 * @param {string[]} prefix
 * @returns {Pair[]}
 */
function flat(obj, prefix = []) {
  /** @type {Pair[]} */
  const out = [];
  if (obj === null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (isMeta(k)) continue;
    if (v && typeof v === "object") out.push(...flat(v, [...prefix, k]));
    else out.push([[...prefix, k].map(kebab).join("-"), String(v)]);
  }
  return out;
}

/** @param {string} group */
const group = (group) => /** @type {TokenGroup} */ (tokens[group]);

const staticGroups = [
  "font",
  "type",
  "space",
  "radius",
  "elevation",
  "size",
  "breakpoint",
  "motion",
];
const staticVars = staticGroups.flatMap((g) => flat(group(g), [g]));
const colorGroup = group("color");
const colorNames = Object.keys(colorGroup).filter((k) => !isMeta(k));
/** @param {"light" | "dark"} theme @returns {Pair[]} */
const colorVars = (theme) =>
  colorNames.map((n) => {
    const entry = /** @type {TokenGroup} */ (colorGroup[n]);
    return [`color-${kebab(n)}`, String(entry[theme])];
  });

/** @param {Pair[]} pairs @param {string} [indent] */
const decl = (pairs, indent = "  ") =>
  pairs.map(([n, v]) => `${indent}--cs-${n}: ${v};`).join("\n");

const css = `/* Generated from tokens.json by @cs/design-tokens. Do not edit by hand. */
:root {
${decl(staticVars)}
${decl(colorVars("light"))}
  color-scheme: light;
}
[data-theme="dark"] {
${decl(colorVars("dark"))}
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${decl(colorVars("dark"), "    ")}
    color-scheme: dark;
  }
}
`;

/**
 * The raw token object without $comment/derived metadata.
 * @param {TokenValue} obj
 * @returns {TokenValue}
 */
function strip(obj) {
  if (!obj || typeof obj !== "object") return obj;
  /** @type {TokenGroup} */
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!isMeta(k)) out[k] = strip(v);
  return out;
}
const clean = strip(tokens);
const cssVars = Object.fromEntries(
  [...staticVars, ...colorVars("light")].map(([n]) => [n, `--cs-${n}`]),
);
const literal = JSON.stringify(clean, null, 2);
const js = `// Generated from tokens.json by @cs/design-tokens. Do not edit by hand.
export const tokens = ${literal};
export const cssVars = ${JSON.stringify(cssVars, null, 2)};
export const themes = ["light", "dark"];
`;
const dts = `// Generated from tokens.json by @cs/design-tokens. Do not edit by hand.
export declare const tokens: ${literal};
export declare const cssVars: ${JSON.stringify(cssVars, null, 2)};
export declare const themes: readonly ["light", "dark"];
export type Theme = (typeof themes)[number];
`;

const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "tokens.css"), css);
writeFileSync(join(dist, "tokens.js"), js);
writeFileSync(join(dist, "tokens.d.ts"), dts);
console.log(
  `design-tokens: wrote ${staticVars.length} static and ${colorNames.length}×2 color variables to dist/`,
);
