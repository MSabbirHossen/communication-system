import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AA_LARGE_TEXT_AND_UI, AA_TEXT, contrastRatio } from "./contrast.js";

const root = join(import.meta.dirname, "..");
type ThemeValue = { light: string; dark: string; derived?: boolean };
type Tokens = {
  color: Record<string, ThemeValue | string>;
  space: Record<string, string>;
  breakpoint: Record<string, string>;
};
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8")) as Tokens;
const colors = Object.fromEntries(
  Object.entries(tokens.color).filter((e): e is [string, ThemeValue] => typeof e[1] === "object"),
);
const themes = ["light", "dark"] as const;

describe("palette completeness", () => {
  it("every color has a light and a dark value in 6-digit hex", () => {
    for (const [name, v] of Object.entries(colors)) {
      for (const t of themes) {
        expect(v[t], `${name}.${t}`).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });
  it("spacing values are multiples of the 4px base", () => {
    for (const [k, v] of Object.entries(tokens.space)) {
      if (k.startsWith("$")) continue;
      const px = Number(v.replace("px", ""));
      expect(px % 4, `space.${k}=${v}`).toBe(0);
    }
  });
  it("breakpoints follow the brief", () => {
    expect(tokens.breakpoint.sm).toBe("360px");
    expect(tokens.breakpoint.md).toBe("768px");
    expect(tokens.breakpoint.lg).toBe("1024px");
  });
});

describe("WCAG 2.2 AA contrast (brief §4.2 asks for validation)", () => {
  // [foreground, background, minimum]
  const textOnSurfaces: Array<[string, string]> = [
    ["text", "bg"],
    ["text", "surface"],
    ["text", "surfaceRaised"],
    ["textMuted", "bg"],
    ["textMuted", "surface"],
    ["primaryText", "surface"],
    ["primaryText", "bg"],
    ["success", "surface"],
    ["warning", "surface"],
    ["danger", "surface"],
    ["success", "bg"],
    ["warning", "bg"],
    ["danger", "bg"],
  ];
  for (const t of themes) {
    for (const [fg, bg] of textOnSurfaces) {
      it(`${t}: ${fg} on ${bg} ≥ ${AA_TEXT}:1`, () => {
        const ratio = contrastRatio(colors[fg]![t], colors[bg]![t]);
        expect(
          ratio,
          `${fg} ${colors[fg]![t]} on ${bg} ${colors[bg]![t]} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
    it(`${t}: onPrimary text on primary buttons ≥ ${AA_TEXT}:1`, () => {
      expect(contrastRatio(colors.onPrimary![t], colors.primary![t])).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(colors.onPrimary![t], colors.primaryHover![t])).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
    it(`${t}: focus ring and borders are visible against the background (≥ ${AA_LARGE_TEXT_AND_UI}:1)`, () => {
      expect(contrastRatio(colors.focus![t], colors.bg![t])).toBeGreaterThanOrEqual(
        AA_LARGE_TEXT_AND_UI,
      );
      expect(contrastRatio(colors.focus![t], colors.surface![t])).toBeGreaterThanOrEqual(
        AA_LARGE_TEXT_AND_UI,
      );
    });
  }
  it("accent is not AA for white text, so it must never carry text (documented)", () => {
    expect(contrastRatio("#FFFFFF", colors.accent!.light)).toBeLessThan(AA_TEXT);
  });
});

describe("generated outputs", () => {
  beforeAll(() => {
    execFileSync(process.execPath, [join(root, "scripts", "build.mjs")], { stdio: "pipe" });
  });
  it("tokens.css defines every color for both themes and the static groups", () => {
    const css = readFileSync(join(root, "dist", "tokens.css"), "utf8");
    for (const name of Object.keys(colors)) {
      const v = `--cs-color-${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
      expect(css.split(v).length - 1, v).toBeGreaterThanOrEqual(3); // :root, [data-theme=dark], media query
    }
    expect(css).toContain("--cs-space-4: 16px;");
    expect(css).toContain("--cs-breakpoint-lg: 1024px;");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("prefers-color-scheme: dark");
  });
  it("tokens.js and tokens.d.ts exist and strip metadata", () => {
    expect(existsSync(join(root, "dist", "tokens.js"))).toBe(true);
    const js = readFileSync(join(root, "dist", "tokens.js"), "utf8");
    expect(js).not.toContain("$comment");
    expect(js).not.toContain("derived");
    expect(readFileSync(join(root, "dist", "tokens.d.ts"), "utf8")).toContain("export type Theme");
  });
});
