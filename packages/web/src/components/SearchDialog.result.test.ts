import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";
import type { SearchResult } from "@spekjs/core";
import { ResultItem, resultKey } from "./SearchDialog";

// Called as functions and inspected as element trees, matching the repo's other component tests — no DOM.

function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out);
    return out;
  }
  const element = node as ReactElement<{ children?: unknown; text?: unknown }>;
  if (element.props?.text !== undefined) out.push(String(element.props.text));
  texts(element.props?.children, out);
  return out;
}

function render(result: SearchResult): string[] {
  return texts(ResultItem({ result, query: "oauth", selected: false, onClick: () => {} }));
}

test("a result whose snippet holds no occurrence still names the file it came from", () => {
  // The name-only case: the query matched the slug, so HighlightText has nothing to mark in either the
  // title or the context. The file is what explains why the row is there at all.
  const rendered = render({
    type: "change",
    title: "add oauth",
    slug: "add-oauth",
    file: "design.md",
    status: "active",
    context: "prose that does not contain the query",
  });
  assert.ok(rendered.includes("design.md"), `expected the file name, got ${JSON.stringify(rendered)}`);
});

test("an archived result is marked as archived", () => {
  const archived = render({
    type: "change",
    title: "old thing",
    slug: "2026-02-13-old-thing",
    file: "proposal.md",
    status: "archived",
    context: "body",
  });
  assert.ok(archived.some((t) => t.toLowerCase() === "archived"));

  const active = render({
    type: "change",
    title: "new thing",
    slug: "new-thing",
    file: "proposal.md",
    status: "active",
    context: "body",
  });
  assert.ok(!active.some((t) => t.toLowerCase() === "archived"));
});

test("two changes sharing a description get distinct keys", () => {
  const a: SearchResult = {
    type: "change",
    title: "fix search",
    slug: "2026-02-13-fix-search",
    context: "",
  };
  const b: SearchResult = {
    type: "change",
    title: "fix search",
    slug: "2026-08-22-fix-search",
    context: "",
  };
  assert.notEqual(resultKey(a), resultKey(b));
});

test("a spec and a change with the same name do not collide", () => {
  const spec: SearchResult = { type: "spec", title: "search-api", topic: "search-api", context: "" };
  const change: SearchResult = { type: "change", title: "search api", slug: "search-api", context: "" };
  assert.notEqual(resultKey(spec), resultKey(change));
});
