# Tasks

> Order matters twice. The artifact contract (§2) must land before the document producers (§3). And core
> must be built (`npm run build:core`) before any web-side test exercises it — the web package imports
> core's `dist/`, so tests against an unbuilt change pass by testing the previous build.

## 1. The search rule in core

- [x] 1.1 Add `packages/core/src/search.ts` as a browser-safe module (no `node:` import, no import of the package's server-side modules) holding the document type and the rule's pure parts; register the `@spekjs/core/search` subpath in `packages/core/package.json` `exports` and in the build entry points. Verify with a test that imports the subpath and asserts the built `dist/search.js` contains no `node:` specifier.
- [x] 1.2 Move `parseSlug` from `scanner.ts` into `search.ts` and re-export it from the package index so existing importers are unaffected; `scanner.ts` imports it from the new home. Verify existing scanner tests still pass and `parseSlug` is reachable from the browser-safe subpath.
- [x] 1.3 Implement the match test: trim the query, lowercase both sides with `String.prototype.toLowerCase` (never `toLocaleLowerCase`), match on document text or on the spec topic / change slug **or the humanised form of either** (`[-_]+` to a single space on both sides). Verify with unit tests covering a deep-in-document match, a case-differing match, a slug match, a match on the humanised slug as displayed on a result card, an approximate query that must not match, and empty/whitespace/untrimmed queries.
- [x] 1.4 Implement snippet extraction: up to 100 UTF-16 code units either side of the first occurrence located **in the original text**, elided at each cut end, never splitting a surrogate pair; for a name-only match, the document head capped at 200. Verify with unit tests over both branches, over a match closer to the start than the window, and over a document containing `İ` before the match (a fold-length change that misaligns a naive offset).
- [x] 1.5 Implement result selection: at most one result per spec and per change, taken from the first document whose **text** contains the query, falling back to the first document only when none does. Verify with unit tests asserting one result for a change matching in three files, that a change whose slug matches and whose `tasks.md` contains the query is answered from `tasks.md`, and that a slug-only match is answered from a markdown document rather than a `.yaml` one.
- [x] 1.6 Implement ordering: documents markdown-and-tasks by filename then data by filename; results specs by topic, then active changes by slug ascending, then archived changes by slug **descending**. Use UTF-16 code-unit comparison throughout — no `localeCompare`, no `Collator`. Verify with unit tests asserting the newest archived change leads, and that `spec-diff` / `specdiff` order by code unit.
- [x] 1.7 Implement `searchDocuments(docs, query)` returning `SearchResult[]` with `title` from `parseSlug` for changes and the topic for specs, `file` populated on every result, and the active/archived status carried. Add `status` to `SearchResult` in `types.ts`. Verify with a unit test asserting the title of `2026-09-10-unified-search-semantics` is `unified search semantics`, that an active change with no date prefix titles correctly, and that no returned result has an absent `file`.

## 2. The artifact contract

- [x] 2.1 Add `file` to `ChangeArtifact` in `packages/core/src/types.ts` (the root filename; absent on the `specs` artifact) and populate it in `buildArtifact` / `discoverArtifacts`. Verify with a core test asserting every root artifact of a fixture change carries its filename and the `specs` artifact carries none.
- [x] 2.2 Carry the raw file content on the `tasks` artifact alongside its parsed structure, in `buildArtifact`. Verify with a core test that a `tasks` artifact exposes both `tasks` and the file's exact text, and with a web test that the Tasks tab still renders from the parsed structure.
- [x] 2.3 Mirror both fields in the Kotlin models (`packages/intellij/.../core/Models.kt`) and in `ArtifactDiscovery.kt`. Verify with a Kotlin test asserting the same two facts as 2.1 and 2.2 against a fixture change.
- [x] 2.4 Run `npm run build:core && npm run build -w @spekjs/ui && npm run type-check` and confirm no consumer broke on the widened type.

## 3. Document producers

- [x] 3.1 Implement the browser-safe producer in `search.ts`: `ChangeDetail` and spec records to documents, in the §1.6 order, taking `content` for markdown, tasks and data artifacts and skipping the `specs` artifact. Verify with a unit test over a hand-built `ChangeDetail`, including that an empty-content artifact still yields a document.
- [x] 3.2 Implement the Node producer on the package index: walk `openspec/specs/*/spec.md` and each change's `rootArtifacts`, reading file text, for active and archived changes, skipping entries whose name begins with `.`. Verify with a unit test over spek's own `openspec/` asserting the delta `specs/` tree contributes nothing, archived changes contribute documents, and a dot-directory contributes nothing.
- [x] 3.3 Add the cross-producer test: for every change in spek's own `openspec/`, the documents from 3.2 equal those from 3.1 built via `readChange`, in count, order, filename and text. Verify it fails if either producer's ordering is changed.
- [x] 3.4 Update or retire `listChangeArtifactFiles`, whose docstring says the web and vscode search indexes share it and whose in-repo callers this change removes. It is a published export, so decide deliberately rather than leaving it stale. Verify with a grep for remaining callers and a passing `npm run build:core`.

## 4. The Kotlin rule

- [x] 4.1 Extract the Kotlin rule into a document-taking function mirroring §1.3-§1.7 (fold with the no-argument `lowercase()`, never `lowercase(Locale)` or Java's `toLowerCase()`; code-unit ordering; offsets in the original text), separate from the filesystem walk. Verify with Kotlin unit tests mirroring 1.3-1.7's assertions.
- [x] 4.2 Reimplement the Kotlin document producer over `ArtifactFiles.rootArtifacts`, matching §3.2 including the dot-entry rule. Verify with a Kotlin test over a fixture repository.

## 5. Shared fixture corpus

- [x] 5.1 Create `test-fixtures/search/` with one JSON file per case (`name`, `note`, `input` documents, `query`, `expected` results) and seed it with cases for: a match past the first 1000 characters, case-differing match, a fold a Turkish locale would break (`I` / `ı` written as escapes), a slug match, a match on the humanised slug, a slug match that must still be answered from the document containing the query, a change matching in three files, ordering across specs and active and archived changes, a blank query, a query spanning two documents that must not match, and a data-artifact match. Restrict non-ASCII cases to case mappings stable across Unicode releases.
- [x] 5.2 Add the TS loader and corpus test reading every file in that directory, with the printable-ASCII-plus-escapes byte guard on inputs. Verify a fixture containing a literal non-ASCII character is rejected; assert only that it is rejected, not the wording.
- [x] 5.3 Add the Kotlin loader and corpus test reading the same directory with the same guard. Verify `./gradlew test` asserts every case, and that adding a case file needs no edit in either language.

## 6. Wire up the surfaces

- [x] 6.1 Replace the Fuse index in `packages/web/server/routes/openspec.ts` `/search` with the core rule. Return HTTP 400 only when `q` is absent (a presence test, not `if (!q)`) or is array-valued; return an empty array for a present-but-blank one. Verify with server tests covering absent / empty / blank / repeated `q`, plus a deep-in-document match that fails against the current implementation.
- [x] 6.2 Replace the duplicated Fuse index in `packages/vscode/src/handler.ts` `search` with the same core call, leaving no search logic in the handler and aligning its absent-query behaviour with 6.1. Verify by grepping the handler for `Fuse` and by a test asserting it returns what core returns.
- [x] 6.3 Rewrite `StaticAdapter.search()` to build documents via 3.1 and call the core rule, removing its own substring, snippet, join-all-artifacts and title handling. Verify with tests that a term only in a task's text is found, that a query spanning two artifacts does not match, and that change results are titled rather than raw slugs.
- [x] 6.4 Rewrite `SearchService.kt` over §4.1, and make the route reject an absent `q` with 400 instead of defaulting it to `""` (`SpekHttpRequestHandler.kt`). Verify with `./gradlew test` including the corpus cases from 5.3 and a route test for the 400.
- [x] 6.5 Remove `fuse.js` from `packages/web/package.json` and `packages/vscode/package.json`, and confirm no source file imports it. Verify with `npm run build` and a repo-wide grep for `fuse`.

## 7. Search dialog

- [x] 7.1 Show the source artifact file on each result row and mark results belonging to archived changes, so a name-only match with nothing to highlight still explains itself. Verify with a component test over a result whose context contains no occurrence of the query.
- [x] 7.2 Key result rows by slug or topic rather than by title, so two changes sharing a description no longer collide. Verify with a component test rendering two results with identical titles and distinct slugs.

## 8. Gates

- [x] 8.1 Run `npm run build:core && npm run build -w @spekjs/ui && npm run type-check && npm run lint && npm test` and confirm all pass.
- [x] 8.2 Run `./gradlew test` in `packages/intellij` and confirm all pass.
- [x] 8.3 Rebuild the static demo (`NODE_ENV=production npm run build:demo`) and confirm in the built page that a term appearing only in a task's text is found and that a result copied from a card finds itself; then revert `docs/demo.html`, which ships at release time rather than from a change.
