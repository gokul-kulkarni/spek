import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "./MarkdownRenderer";

// Which spellings of a BDD keyword are marked, and where.
//
// The rule is per keyword group, because the groups do not carry the same obligation: OpenSpec never
// parses a step keyword, matches SHALL/MUST case-sensitively, and the delta operations' lowercase
// forms are ordinary words. See the `bdd-keyword-casing` change for the measurements.

const render = (content: string) =>
  renderToStaticMarkup(createElement(MarkdownRenderer, { content }));

/** Every BDD mark in the rendered output, in order, as its colour token. */
const marks = (content: string) =>
  [...render(content).matchAll(/text-(?:kw|badge)-[a-z]+/g)].map((m) => m[0]);

// The document from issue #53, verbatim. Two trailing spaces per line make these hard breaks, so all
// three steps arrive as one paragraph — the keywords carry no line of their own for a rule to read.
const REPORTED = [
  '**Given** a project named "budget" is registered  ',
  "**When** the user navigates to `/budget`  ",
  "**Then** the budget module loads and displays its wizard",
  "",
].join("\n");

test("the reported title-case document is marked, all three steps", () => {
  assert.deepEqual(marks(REPORTED), ["text-kw-when", "text-kw-when", "text-kw-then"]);
});

test("all four step keywords are admitted in title case", () => {
  // `And` is the one most likely to collide if the guard is ever loosened (194 of the corpus's 479
  // emphasised non-uppercase runs), so it is asserted rather than left to the other three.
  assert.deepEqual(marks("**Given** x\n\n**When** y\n\n**Then** z\n\n**And** w\n"), [
    "text-kw-when",
    "text-kw-when",
    "text-kw-then",
    "text-kw-and",
  ]);
});

test("a title-case step keeps the casing the document wrote", () => {
  const html = render("- **Given** x\n");
  assert.match(html, /text-kw-when[^"]*">Given</);
  assert.doesNotMatch(html, />GIVEN</);
});

test("an unemphasised title-case step is not marked", () => {
  assert.deepEqual(marks("- Given a project named \"budget\" is registered\n"), []);
});

test("requirement prose opening with a keyword marks only its normative word", () => {
  assert.deepEqual(
    marks("When the server receives a request, it SHALL respond within 200ms.\n"),
    ["text-kw-normative"]
  );
});

test("a keyword inside a longer bold run is not marked", () => {
  assert.deepEqual(marks("**Given the user is logged in**\n"), []);
});

test("a bold run holding more than the keyword is not marked", () => {
  // The children here are ["Given ", <code>], which the helper alone cannot tell from a bare label.
  assert.deepEqual(marks("**Given `x`**\n"), []);
});

test("an impact list's **Modified**: label is not badged", () => {
  // Three of this repository's own archived proposals head an impact list exactly this way, and the
  // word names no delta operation there.
  assert.deepEqual(marks("- **Modified**: `packages/web/src/components/MarkdownRenderer.tsx`\n"), []);
});

test("the uppercase delta operation is still badged", () => {
  assert.deepEqual(marks("- **MODIFIED**: `a.ts`\n"), ["text-badge-modified"]);
});

test("a title-case normative keyword is not marked", () => {
  assert.deepEqual(marks("**Shall** and **Must**\n"), []);
});

test("the uppercase normative keyword is still marked, under emphasis and in prose", () => {
  assert.deepEqual(marks("**SHALL** and it MUST\n"), ["text-kw-normative", "text-kw-normative"]);
});

test("no spelling below title case is marked, in any group", () => {
  assert.deepEqual(marks("**when** **then** **added** **shall**\n"), []);
});

test("a keyword in a heading is not marked, emphasised or not", () => {
  // `strong` is an inline component, so an emphasised keyword in a heading used to reach it — and
  // `## **ADDED** Requirements` was badged while the unemphasised form every spec uses was not.
  assert.deepEqual(marks("## **ADDED** Requirements\n"), []);
  assert.deepEqual(marks("### **GIVEN** the user is known\n"), []);
  assert.deepEqual(marks("#### **Given** the user is known\n"), []);
  assert.deepEqual(marks("## ADDED Requirements\n"), []);
});

test("a heading's id and text survive the guard", () => {
  const html = render("### **GIVEN** the user is known\n");
  assert.match(html, /<h3 id="given-the-user-is-known"/);
  assert.match(html, /<strong[^>]*>GIVEN<\/strong>/);
});

test("uppercase keywords outside a heading are unaffected", () => {
  assert.deepEqual(marks("- **WHEN** x\n"), ["text-kw-when"]);
  assert.deepEqual(marks("Prose mentioning ADDED and REMOVED.\n"), [
    "text-badge-added",
    "text-badge-removed",
  ]);
});
