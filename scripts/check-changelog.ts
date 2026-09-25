/**
 * Fails when package.json's version has no What's New entry.
 *
 * Every commit bumps the version, and the "new" dot keys off CHANGELOG[0], so
 * a release without an entry would ship with a stale What's New. Runs in
 * prebuild. Reads no git history on purpose: Workers Builds clones shallow.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { LATEST_VERSION } from "../src/lib/changelog";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8")) as {
  version: string;
};

if (LATEST_VERSION !== pkg.version) {
  console.error(
    `✖ What's New is at v${LATEST_VERSION}, package.json is v${pkg.version}.\n` +
      "  Add this release's changes to the newest entry in src/lib/changelog.ts " +
      "(bump its version and widen its label), or start a new entry."
  );
  process.exit(1);
}

console.log(`✓ What's New covers v${pkg.version}.`);
