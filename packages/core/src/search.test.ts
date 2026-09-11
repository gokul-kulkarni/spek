import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  changeSearchDocuments,
  parseSlug,
  searchDocuments,
  specSearchDocument,
  type SearchDocument,
} from "./search.js";
import type { ChangeDetail } from "./types.js";

function changeDoc(
  name: string,
  file: string,
  text: string,
  status: "active" | "archived" = "active",
): SearchDocument {
  return { type: "change", name, file, text, status };
}

test("a verbatim term past the first thousand characters is found", () => {
  const text = "x".repeat(1200) + "\nUNIQUETOKEN\n";
  const results = searchDocuments([specSearchDocument("foo", text)], "UNIQUETOKEN");
  assert.equal(results.length, 1);
  assert.equal(results[0].topic, "foo");
  assert.ok(results[0].context.includes("UNIQUETOKEN"));
});

test("case is ignored in both directions", () => {
  const docs = [specSearchDocument("foo", "a SwitchUserToken here")];
  assert.equal(searchDocuments(docs, "switchusertoken").length, 1);
  assert.equal(searchDocuments(docs, "SWITCHUSERTOKEN").length, 1);
});

test("an approximate query does not match", () => {
  const docs = [specSearchDocument("foo", "worktree aggregation rules")];
  assert.deepEqual(searchDocuments(docs, "agregation"), []);
});

test("a change matches on its slug even when no file contains the query", () => {
  const docs = [changeDoc("add-oauth", "proposal.md", "nothing relevant")];
  const results = searchDocuments(docs, "oauth");
  assert.equal(results.length, 1);
  assert.equal(results[0].slug, "add-oauth");
});

test("a query copied from a result card finds the result again", () => {
  // The card shows the humanised description, so the hyphenated slug alone is not enough.
  const docs = [changeDoc("unified-search-semantics", "proposal.md", "nothing relevant")];
  const results = searchDocuments(docs, "unified search semantics");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "unified search semantics");
});

test("a spec topic matches in its displayed form too", () => {
  const docs = [specSearchDocument("spec-diff", "unrelated body")];
  assert.equal(searchDocuments(docs, "spec diff").length, 1);
});

test("an empty, blank or whitespace-only query returns nothing", () => {
  const docs = [specSearchDocument("foo", "anything at all")];
  for (const q of ["", "   ", "\t\n"]) assert.deepEqual(searchDocuments(docs, q), []);
});

test("a query is trimmed before matching", () => {
  const docs = [specSearchDocument("foo", "worktree aggregation")];
  assert.equal(searchDocuments(docs, "  aggregation  ").length, 1);
});

test("the snippet surrounds the first occurrence, not a later one", () => {
  const text = "start TOKEN " + "z".repeat(5000) + " TOKEN end";
  const [result] = searchDocuments([specSearchDocument("foo", text)], "TOKEN");
  assert.ok(result.context.startsWith("start TOKEN"));
});

test("snippet offsets are located in the original text, not the folded copy", () => {
  // U+0130 expands to two code units under whole-string toLowerCase. An offset taken from that copy and
  // applied to the original shifts every snippet after it by one.
  const text = "İ" + "a".repeat(200) + "TOKEN" + "b".repeat(200);
  const [result] = searchDocuments([specSearchDocument("foo", text)], "TOKEN");
  assert.equal(result.context, "..." + "a".repeat(100) + "TOKEN" + "b".repeat(100) + "...");
});

test("a name-only match gets the head of the document as its snippet", () => {
  const text = "y".repeat(500);
  const [result] = searchDocuments([changeDoc("add-oauth", "proposal.md", text)], "oauth");
  assert.equal(result.context, "y".repeat(200) + "...");
});

test("a change matching in three files yields one result", () => {
  const docs = [
    changeDoc("c", "design.md", "TOKEN in design"),
    changeDoc("c", "proposal.md", "TOKEN in proposal"),
    changeDoc("c", "tasks.md", "TOKEN in tasks"),
  ];
  const results = searchDocuments(docs, "TOKEN");
  assert.equal(results.length, 1);
});

test("a textual occurrence wins over an earlier document that only matched by name", () => {
  // The slug matches, so every document matches. The result must still come from the file that actually
  // contains the query, or the reader gets a snippet with nothing they typed in it.
  const docs = [
    changeDoc("add-oauth", "design.md", "no occurrence here"),
    changeDoc("add-oauth", "tasks.md", "wire up oauth callback"),
  ];
  const [result] = searchDocuments(docs, "oauth");
  assert.equal(result.file, "tasks.md");
  assert.ok(result.context.includes("oauth"));
});

test("a slug-only match is answered from a markdown document, not a data one", () => {
  const docs = [
    changeDoc("add-oauth", "design.md", "design prose"),
    changeDoc("add-oauth", "asyncapi.yaml", "openapi: 3.0.0"),
  ];
  const [result] = searchDocuments(docs, "add-oauth");
  assert.equal(result.file, "design.md");
});

test("results order specs, then active changes, then archived newest first", () => {
  const docs = [
    changeDoc("2026-02-13-old", "proposal.md", "TOKEN", "archived"),
    changeDoc("2026-08-22-new", "proposal.md", "TOKEN", "archived"),
    changeDoc("active-one", "proposal.md", "TOKEN"),
    specSearchDocument("a-topic", "TOKEN"),
  ];
  const results = searchDocuments(docs, "TOKEN");
  assert.deepEqual(
    results.map((r) => r.topic ?? r.slug),
    ["a-topic", "active-one", "2026-08-22-new", "2026-02-13-old"],
  );
});

test("ordering uses code units, not locale collation", () => {
  // Under ICU collation the hyphen is weakened and `spec-diff` sorts after `specdiff`.
  const docs = [specSearchDocument("specdiff", "TOKEN"), specSearchDocument("spec-diff", "TOKEN")];
  assert.deepEqual(
    searchDocuments(docs, "TOKEN").map((r) => r.topic),
    ["spec-diff", "specdiff"],
  );
});

test("every result names the file it came from and carries its status", () => {
  const docs = [
    changeDoc("2026-01-01-done", "design.md", "TOKEN", "archived"),
    specSearchDocument("topic", "TOKEN"),
  ];
  for (const result of searchDocuments(docs, "TOKEN")) {
    assert.ok(result.file, "file must be populated");
  }
  const change = searchDocuments(docs, "TOKEN").find((r) => r.type === "change");
  assert.equal(change?.status, "archived");
});

test("titles drop an archive date prefix and keep an active slug whole", () => {
  assert.equal(parseSlug("2026-09-10-unified-search-semantics").description, "unified search semantics");
  assert.equal(parseSlug("2026-09-10-unified-search-semantics").date, "2026-09-10");
  assert.equal(parseSlug("unified-search-semantics").description, "unified search semantics");
  assert.equal(parseSlug("unified-search-semantics").date, null);
});

test("changeSearchDocuments orders markdown and tasks before data, each by filename", () => {
  const detail = {
    slug: "c",
    status: "active",
    artifacts: [
      { id: "asyncapi", title: "asyncapi.yaml", kind: "data", file: "asyncapi.yaml", content: "y" },
      { id: "tasks", title: "Tasks", kind: "tasks", file: "tasks.md", content: "t", tasks: undefined },
      { id: "design", title: "Design", kind: "markdown", file: "design.md", content: "d" },
      { id: "specs", title: "Specs", kind: "specs", specs: [{ topic: "x", content: "should be skipped" }] },
    ],
  } as unknown as ChangeDetail;
  assert.deepEqual(
    changeSearchDocuments(detail).map((d) => d.file),
    ["design.md", "tasks.md", "asyncapi.yaml"],
  );
});

test("an artifact with empty content still yields a document", () => {
  const detail = {
    slug: "c",
    status: "active",
    artifacts: [{ id: "notes", title: "Notes", kind: "markdown", file: "notes.md", content: "" }],
  } as unknown as ChangeDetail;
  const docs = changeSearchDocuments(detail);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].text, "");
});

test("the rule stays reachable from a browser bundle", () => {
  const source = readFileSync(fileURLToPath(new URL("./search.ts", import.meta.url)), "utf-8");
  assert.ok(!/from\s+["']node:/.test(source), "search.ts must not import a Node built-in");
  assert.ok(
    !/from\s+["']\.\/(scanner|artifact-files|artifact-discovery|search-documents|openspec-cli)\.js["']/.test(
      source,
    ),
    "search.ts must not import a server-side module",
  );
});
