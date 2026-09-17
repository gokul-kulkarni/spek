# Tasks

> Both new tests belong to the `strong` component, not to `highlightBddKeywords`. A `<strong>` holding
> `["Given ", <code>…</code>]` reaches the helper as the string `"Given "` with no way to see its
> sibling, and the helper cannot see its ancestors either. So §1.2 lands before §1.3.
>
> `strong` is an inline component and runs inside headings: `## **ADDED** Requirements` is marked
> today. §1.2 therefore carries the heading guard as well, and §1.5 pins the current unemphasised
> behaviour first so the guard is verified against something.
>
> `@spekjs/core` must be built (`npm run build:core`) before any web-side test means anything — the web
> package imports core's `dist/`, so §2 without a build leaves §3 testing the previous build.

## 1. The casing rule in the renderer

- [x] 1.1 Restructure the keyword table in `packages/web/src/components/MarkdownRenderer.tsx` so each entry carries its group alongside its classes and weight, replacing the two spelling-keyed records and the `Object.keys` pattern build. The group decides whether a non-uppercase spelling is admitted, so adding a keyword forces the choice rather than leaving it to a second list of names. Verify with `npm test -w @spekjs/web` that every existing suite passes unchanged — the restructure alters no current behaviour.
- [x] 1.2 Give the `strong` component the two decisions the helper cannot make: whether its children resolve to a single text run whose trimmed text is exactly one recognised keyword, and whether it is inside a heading. Pass both into `processChildren` / `highlightBddKeywords` alongside `inStrong`. Verify with tests that `**Given**` is a bare keyword while `**Given the user is logged in**` and ``**Given `x`**`` are not, and that `**Given**` inside `### ` is reported as in-heading.
- [x] 1.3 Admit the title-case spelling of the step keywords (`When`, `Given`, `Then`, `And`) only when the bare-keyword decision holds and the heading decision does not, keeping the uppercase spelling matched in any position outside a heading. Look the styling up by the normalised (uppercase) spelling while rendering `match[1]`, the text the document contains. Verify with tests that `**Given**` renders with `text-kw-when` and that the rendered text is `Given`, not `GIVEN`.
- [x] 1.4 Leave `MUST` / `SHALL` and the four delta operations matching uppercase only, so neither is recognised in title case even under emphasis. Verify with tests that `**Shall**`, `**Must**` and `**Modified**:` are unmarked while `**SHALL**` and `**MODIFIED**:` stay marked, and that `**SHALL**` keeps its inherited weight (the author-emphasis assertion in `MarkdownRenderer.fold.test.ts` must not regress).
- [x] 1.5 Suppress every keyword mark inside a heading, at all levels and in all spellings, leaving heading styling, ids and folding untouched. Verify with tests that `## **ADDED** Requirements` and `### **GIVEN** x` render no mark — both are marked before this task and must fail against the pre-change renderer — while `## ADDED Requirements` is unmarked as it already is, and that `MarkdownRenderer.hierarchy.test.ts` and `MarkdownRenderer.fold.test.ts` still pass.
- [x] 1.6 Add `packages/web/src/components/MarkdownRenderer.casing.test.ts` covering the delta spec's scenarios end to end: the reporter's own document from issue #53 (three hard-broken `**Given**` / `**When**` / `**Then**` lines, which arrive as one paragraph), a bare `- Given a project is registered` list item that must stay unmarked, the prose sentence `When the server receives a request, it SHALL respond within 200ms` where only `SHALL` is marked, a `- **Modified**: \`a.ts\`` impact line that must stay unmarked, and a bold run of `when` / `then` / `added` / `shall` that is unmarked at every keyword. Verify each assertion fails against the pre-change renderer or states a behaviour §1.5 protects.

## 2. The heading-label rule in core

- [x] 2.1 Add the `i` flag to `SPEC_HEADING_KEYWORD_RE` in `packages/core/src/headings.ts` and update the comment above it, which states the rule as case-sensitive and cites a reading of OpenSpec's parser that v1.4.0 made false. Verify with tests in `packages/core/src/headings.test.ts` that `requirement: lowercase keyword` and `SCENARIO: shouty keyword` are elided, that `requirement:` is returned unchanged with its casing intact, that `Optional requirement: something` is returned unchanged, and that `extractHeadings` over `### requirement: Foo` still yields `text` `"requirement: Foo"` with slug `"requirement-foo"`.
- [x] 2.2 Invert the existing `specHeadingLabel: a case variant is unchanged` test at `packages/core/src/headings.test.ts:119-125`, whose comment encodes the now-false rationale. It is the only test in the repository whose expected behaviour this change reverses, so it is called out rather than left to be discovered mid-run.
- [x] 2.3 Run `npm run build:core` and confirm no other core module or exported type changed. Verify `npm run type-check` passes across core, ui, web, vscode and scripts.

## 3. The surfaces that display a heading label

- [x] 3.1 Verify the spec TOC elides a case-variant keyword, with a test in `packages/web/src/components/SpecToc.test.ts` over a heading reading `requirement: lowercase keyword`. It goes through `specHeadingLabel`, so this asserts the surface is wired rather than re-testing the rule.
- [x] 3.2 Verify the rendered content agrees with the TOC, with a test in `MarkdownRenderer.keyword.test.ts` that a `### requirement: Foo` heading renders without the keyword while keeping id `requirement-foo`. The two read the same heading by different paths and a disagreement between them is invisible on screen.
- [x] 3.3 Confirm by inspection that the VS Code tree needs no change: `packages/vscode/src/tree-provider.ts:82` passes `heading.text` straight to `specHeadingLabel`, so it inherits §2.1. No test is added — `packages/vscode` has no test script, no test files and no runner in root `npm test`, so one would never be executed by any gate. Verify the call site is still a bare pass-through.

## 4. Gates

- [x] 4.1 Run `npm run build:core && npm run build -w @spekjs/ui && npm run type-check && npm run lint && npm test` and confirm all pass. Building ui as well as core is required — a clean tree without it fails `type-check` with TS2307 on the ui imports.
- [x] 4.2 Confirm no Kotlin work is outstanding: grep `packages/intellij/src/main/kotlin` for a `specHeadingLabel` or BDD-keyword counterpart and confirm there is none (the IntelliJ tool window loads the same React SPA). Run `./gradlew test` in `packages/intellij` to confirm the change leaves it passing.
- [x] 4.3 Run the web app against a scratch spec holding the issue #53 snippet — this change's own artifacts cannot serve, since every title-case keyword in them is inside backticks and the renderer never marks code. Confirm by eye in both themes that a title-case step carries the same pill as its uppercase spelling, that `## **ADDED** Requirements` shows no badge, and that an archived proposal's `**Modified**:` impact line is unmarked. No colour token changes in this change, so `contrast.test.ts` needs no new row.
