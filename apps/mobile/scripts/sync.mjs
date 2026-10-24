// Copies the web build and plugin configuration into the native platforms (`cap sync`).
// Run by `pnpm -r build` after @cs/web (declared as a workspace devDependency so pnpm orders
// the builds); `pnpm --filter @cs/mobile build:web` builds the web app first when run alone.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(root, "..", "web", "dist", "index.html");
if (!existsSync(webDist)) {
  console.error(
    "mobile: web build not found at apps/web/dist; run `pnpm --filter @cs/mobile build:web`",
  );
  process.exit(1);
}
const platforms = ["android", "ios"].filter((p) => existsSync(join(root, p)));
if (platforms.length < 2) {
  console.error(
    `mobile: native platforms missing (${platforms.join(", ") || "none"}); they are committed under apps/mobile/android and apps/mobile/ios.`,
  );
  process.exit(1);
}
// `cap sync` copies the web build and the generated plugin lists into both native projects.
const result = spawnSync("npx", ["cap", "sync"], { cwd: root, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
