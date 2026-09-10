// Colima normally shares the home directory, but not /private/tmp worktrees.
// Copy only application inputs into a new shared, credential-free snapshot.
import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const snapshots = join(homedir(), ".cache", "nana-privy-runtime");
await mkdir(snapshots, { recursive: true });
const target = await mkdtemp(join(snapshots, "source-"));
for (const name of ["src", "tsconfig.json", "examples"]) {
  await cp(join(root, name), join(target, name), { recursive: true });
}
console.log(target);
