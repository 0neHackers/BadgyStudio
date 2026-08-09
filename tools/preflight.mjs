/**
 * Refuses to start if the build is missing something it needs.
 *
 * WHY THIS EXISTS
 *
 * V05.07 shipped without `postcss.config.mjs`. It had been deleted by an
 * over-broad `rm *.mjs` during a cleanup, and nothing noticed, because nothing
 * was looking. Without it Tailwind's PostCSS plugin never runs, so `@theme`
 * and `@utility` pass through to the browser as unknown at-rules and the app
 * loads with no styling at all.
 *
 * The reason it got past the checks is worth stating plainly. `next build`,
 * `next lint` and `tsc` all succeeded, because they were run against a working
 * copy in a different directory that still had the file. The version that
 * shipped was never actually started. A green build somewhere else is not
 * evidence about the folder someone is going to run.
 *
 * So this checks the folder it is standing in, and it runs before `dev` and
 * before `build` via the `predev` and `prebuild` scripts, which means it
 * cannot be forgotten the way a manual step can.
 *
 * It is deliberately dependency-free and fast: reading a directory listing
 * costs nothing and it runs on every single start.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Files a standalone build cannot run without, and what breaks if each one is
 * missing. The explanation matters more than the list: "postcss.config.mjs is
 * missing" is not obviously the same problem as "the page has no styling".
 */
const REQUIRED = [
  {
    path: "package.json",
    why: "nothing resolves without it",
  },
  {
    path: "postcss.config.mjs",
    why: "Tailwind never runs, @theme and @utility reach the browser raw, and the app loads unstyled",
  },
  {
    path: "next.config.ts",
    why: "the footer version and the security headers come from it",
  },
  {
    path: "tsconfig.json",
    why: "the @/* path alias stops resolving",
  },
  {
    path: "eslint.config.mjs",
    why: "npm run lint fails to start",
  },
  {
    path: "src/app/globals.css",
    why: "there is no stylesheet",
  },
  {
    path: "src/app/layout.tsx",
    why: "there is no document shell",
  },
  {
    path: "public/sample-roster-500.csv",
    why: "the Load sample button 404s",
  },
];

/**
 * Packages the build loads through configuration rather than through an
 * import, so a bundler cannot tell you they are missing.
 */
const REQUIRED_PACKAGES = [
  { name: "@tailwindcss/postcss", why: "postcss.config.mjs names it and it is not installed" },
  { name: "tailwindcss", why: "the utilities it generates are the entire stylesheet" },
  { name: "next", why: "there is no framework" },
];

const problems = [];

for (const file of REQUIRED) {
  if (!existsSync(resolve(root, file.path))) {
    problems.push(`missing ${file.path} — ${file.why}`);
  }
}

for (const pkg of REQUIRED_PACKAGES) {
  if (!existsSync(resolve(root, "node_modules", pkg.name))) {
    problems.push(`${pkg.name} is not installed — ${pkg.why}`);
  }
}

/**
 * An install that was interrupted leaves the packages extracted and the
 * executables unlinked, so `node_modules` looks full and `next` is not on the
 * path. The failure that produces is `sh: next: not found`, which reads like a
 * broken script rather than a half-finished install.
 *
 * Only worth checking once the packages themselves are there; otherwise the
 * missing-package messages above already say it better.
 */
if (existsSync(resolve(root, "node_modules", "next"))) {
  const nextBin = resolve(root, "node_modules", ".bin", "next");
  if (!existsSync(nextBin) && !existsSync(`${nextBin}.cmd`)) {
    problems.push(
      "node_modules is present but its executables are not linked — the install did not finish. Run: npm install",
    );
  }
}

/**
 * The stylesheet uses Tailwind v4 at-rules, which only mean anything if the
 * PostCSS plugin processes them. If they are present, the plugin has to be
 * wired up; catching that here beats catching it as an unstyled page.
 */
const cssPath = resolve(root, "src/app/globals.css");
if (existsSync(cssPath)) {
  const css = readFileSync(cssPath, "utf8");
  const usesV4 = /@theme\b|@utility\b|@import\s+["']tailwindcss["']/.test(css);
  const configPath = resolve(root, "postcss.config.mjs");

  if (usesV4 && existsSync(configPath)) {
    const config = readFileSync(configPath, "utf8");
    if (!config.includes("@tailwindcss/postcss")) {
      problems.push(
        "postcss.config.mjs does not load @tailwindcss/postcss, so globals.css will not be processed",
      );
    }
  }
}

if (problems.length > 0) {
  const listing = readdirSync(root)
    .filter((name) => name !== "node_modules" && name !== ".next")
    .join(", ");

  console.error("\nPreflight failed. This build is missing something it needs.\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\nWhat is actually in ${root}:\n  ${listing}\n`);
  console.error("If a file is missing, copy it from the previous version folder.");
  console.error("If a package is missing, run: npm install\n");
  process.exit(1);
}

console.log("Preflight ok.");
