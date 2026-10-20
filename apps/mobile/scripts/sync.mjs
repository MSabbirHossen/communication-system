// Copies the web build into native platforms when they exist; otherwise explains why not.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDist = join(root, "..", "web", "dist", "index.html");
if (!existsSync(webDist)) {
  console.error(
    "mobile: web build not found at apps/web/dist; run `pnpm --filter @cs/web build` first",
  );
  process.exit(1);
}
const platforms = ["android", "ios"].filter((p) => existsSync(join(root, p)));
if (platforms.length === 0) {
  console.log(
    "mobile: no native platforms present (expected in Phase 1). Phase 5 adds them with `pnpm --filter @cs/mobile cap add android|ios` after the device spike (ADR-0001 C2).",
  );
  process.exit(0);
}
const result = spawnSync("npx", ["cap", "copy"], { cwd: root, stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
