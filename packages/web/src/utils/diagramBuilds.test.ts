import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Which builds draw diagrams, asserted against the build configs themselves.
 *
 * This is a size guard, and it is here because the thing it protects is invisible in every other check:
 * Mermaid costs 5.23 MB inlined into a single-file bundle, on top of 719 KB. Nothing about a bundle that
 * is 8× too big fails a type-check, a lint or a test — it just lands in `docs/demo.html`, which is
 * committed to the repository, on the next release.
 *
 * Both mechanisms are asserted, because they do different jobs. The `define` decides what the reader
 * sees (source, calmly, rather than a load failure); the alias decides whether the bytes exist at all.
 * Dropping the alias and trusting tree-shaking to follow the flag through a dynamic import is the
 * regression this exists to catch — it would still behave correctly, and cost 5.23 MB.
 */

const config = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf8");

/** The three single-file IIFE builds: no code splitting, so an import is inlined rather than deferred. */
const SINGLE_FILE_BUILDS = [
  "vite.webview.config.ts",
  "vite.intellij.config.ts",
  "vite.demo.config.ts",
];

test("the Web build draws diagrams", () => {
  // A real ESM build, so Mermaid lands in lazy chunks a repository with no diagrams never fetches.
  assert.match(config("vite.config.ts"), /__SPEK_DRAWS_DIAGRAMS__:\s*"true"/);
});

test("no single-file build draws diagrams", () => {
  for (const name of SINGLE_FILE_BUILDS) {
    assert.match(
      config(name),
      /__SPEK_DRAWS_DIAGRAMS__:\s*"false"/,
      `${name} must not declare that it draws: it cannot code-split, so Mermaid would be inlined`,
    );
  }
});

test("every single-file build aliases mermaid away", () => {
  for (const name of SINGLE_FILE_BUILDS) {
    assert.match(
      config(name),
      /alias:\s*\{\s*mermaid:/,
      `${name} must alias mermaid to the stand-in, or 5.23 MB of it ships in one file`,
    );
  }
});

test("the stand-in resolves to nothing", () => {
  // If this ever grows an implementation, the alias stops being an exclusion.
  const stub = readFileSync(fileURLToPath(new URL("./mermaidUnavailable.ts", import.meta.url)), "utf8");
  assert.match(stub, /export default null;/);
  // Anchored to a statement, not the word: the module's comment explains what an inlined import costs.
  assert.equal(/^import\s/m.test(stub), false, "the stand-in must import nothing");
});
