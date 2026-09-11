import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchDocuments, type SearchDocument } from "./search.js";
import { checkFixtureBytes } from "./fixture-bytes.test.js";
import type { SearchResult } from "./types.js";

// The search rule is one rule in two languages. This corpus is what holds them together: every case is a
// single JSON file, read in full here and by SearchCorpusTest.kt, so a case added in either language is
// asserted by the other from its next run.
//
// Narrower than test-fixtures/task-parser/ on purpose: no generator and no invalid/ corpus. The task
// parser's cross-language traps came from line-boundary definitions that differ between the runtimes;
// search has one such trap (case folding) and otherwise runs on UTF-16 code units in both languages.
// The byte guard is shared with that corpus rather than restated — a second copy of a rule is what these
// fixtures exist to prevent.

const CORPUS = fileURLToPath(new URL("../../../test-fixtures/search", import.meta.url));

/**
 * A case asserts exactly the fields it states. An expected result naming only `topic` says nothing about
 * the snippet, which keeps a case about ordering from restating a hundred characters of context it does
 * not care about.
 */
interface Fixture {
  name: string;
  note: string;
  input: SearchDocument[];
  query: string;
  expected: Partial<SearchResult>[];
}

function fail(file: string, why: string): never {
  throw new Error(`${file}: ${why}`);
}

function isDocument(value: unknown, file: string): SearchDocument {
  if (typeof value !== "object" || value === null) fail(file, "each input document must be an object");
  const doc = value as Record<string, unknown>;
  if (doc.type !== "spec" && doc.type !== "change") fail(file, 'document type must be "spec" or "change"');
  for (const key of ["name", "file", "text"]) {
    if (typeof doc[key] !== "string") fail(file, `document ${key} must be a string`);
  }
  if (doc.status !== undefined && doc.status !== "active" && doc.status !== "archived") {
    fail(file, 'document status must be "active" or "archived" when present');
  }
  return doc as unknown as SearchDocument;
}

function parseFixture(document: string, file: string): Fixture {
  let raw: unknown;
  try {
    raw = JSON.parse(document);
  } catch (err) {
    fail(file, `not valid JSON: ${String(err)}`);
  }
  if (typeof raw !== "object" || raw === null) fail(file, "must be a JSON object");
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string" || !value.name) fail(file, "name must be a non-empty string");
  if (typeof value.note !== "string" || !value.note) fail(file, "note must be a non-empty string");
  if (typeof value.query !== "string") fail(file, "query must be a string");
  if (!Array.isArray(value.input)) fail(file, "input must be an array of documents");
  if (!Array.isArray(value.expected)) fail(file, "expected must be an array of results");
  return {
    name: value.name,
    note: value.note,
    query: value.query,
    input: value.input.map((doc) => isDocument(doc, file)),
    expected: value.expected as Partial<SearchResult>[],
  };
}

function loadCorpus(): Fixture[] {
  const files = readdirSync(CORPUS).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, `no fixtures found in ${CORPUS}`);
  return files.sort().map((file) => {
    const path = join(CORPUS, file);
    checkFixtureBytes(new Uint8Array(readFileSync(path)), file);
    const fixture = parseFixture(readFileSync(path, "utf-8"), file);
    assert.equal(fixture.name, basename(file, ".json"), `${file}: name must match its filename`);
    return fixture;
  });
}

for (const fixture of loadCorpus()) {
  test(`search corpus: ${fixture.name}`, () => {
    const actual = searchDocuments(fixture.input, fixture.query);
    assert.equal(actual.length, fixture.expected.length, fixture.note);
    fixture.expected.forEach((expected, i) => {
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(
          actual[i][key as keyof SearchResult],
          value,
          `${fixture.name}: result ${i} field ${key}`,
        );
      }
    });
  });
}

test("search corpus: a fixture with a literal non-ASCII character is rejected", () => {
  const literal = Buffer.from('{"name":"x","note":"n","input":[],"query":"İ","expected":[]}', "utf-8");
  assert.throws(() => checkFixtureBytes(new Uint8Array(literal), "literal.json"));
});
