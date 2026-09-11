## Why

Search is implemented four times — `packages/web/server/routes/openspec.ts`, `packages/vscode/src/handler.ts`
(a verbatim copy of it), `packages/intellij/.../core/SearchService.kt`, and `StaticAdapter.search()` — and the
four disagree about what is indexed, what counts as a match, and how many results a change may produce. Two
reports landed on the same day, each a symptom of a different half of that split:

- **#51** — the Fuse index leaves `location: 0` / `distance: 100` at their defaults, so an exact occurrence is
  penalised by its distance from the start of the document and scores past `threshold: 0.4`. The cutoff is
  `offset / 100 > 0.4`, i.e. **about 40 characters**: measured against the installed fuse.js, an exact term
  at offset 40 scores 0.481 and one at offset 41 is gone. Search is effectively blind past the first line of
  any file — the report's "a few hundred characters" is generous by an order of magnitude. Because the VS
  Code host holds a copy of the same options, it has the same defect; the report only reached the Web
  surface.
- **#52** — `StaticAdapter.search()` builds its corpus from `artifact.content`, but a `tasks` artifact carries
  `tasks: parseTasks(content)` and no `content` at all. Every word of `tasks.md` renders in the Tasks tab and
  is invisible to search in the static build the GitHub Action and the demo ship.

Neither is worth fixing where it was found. The defect is that no one rule says what search does, so each
surface answers the same query differently and a fix has to be discovered separately on each.

## What Changes

- **New**: one search rule in `@spekjs/core`, on a browser-safe subpath so `StaticAdapter` can import it —
  the corpus (which artifacts contribute text, and which text), the match test, and the result order. Kotlin
  mirrors it the way `TaskParser` mirrors `parseTasks`.
- **BREAKING (behaviour)**: matching becomes case-insensitive exact substring on every surface. Fuse.js and
  its fuzzy matching are removed from the Web server and the VS Code host, along with `score`-ranked ordering
  — results are returned in a deterministic scan order instead. A query that only matched by approximation
  no longer matches anywhere; a verbatim occurrence anywhere in an indexed document now matches everywhere
  (**#51**).
- The corpus is stated once and is identical on all four surfaces: every root artifact file of a change
  (markdown, tasks, data) plus every spec body. Where the text comes from a parsed structure rather than a
  file — the static build's `tasks` artifact — the structure is flattened back into text (section titles and
  task text), so the payload does not have to carry `tasks.md` twice (**#52**).
- The change's delta `specs/` tree stays out of the corpus, as today on every surface. Stated, so it is a
  decision rather than four coincidences.
- Spec topic names and change slugs become matchable on every surface. Today only the static build and
  IntelliJ match them; the Web server and VS Code index `content` alone, so searching a change by its own
  slug finds nothing there.
- A change yields **one** result, not one per matching file. The Web server and VS Code currently emit one
  document per artifact file, so a term appearing in three files lists the same change three times.
- Context snippets become one rule: up to 100 characters either side of the match, elided at the cut. Today
  it is ±100 on the server, ±60 in the static build, and ±100 with ellipses in IntelliJ.

## Capabilities

### New Capabilities

- `search-semantics`: what search indexes and what counts as a match, stated once for every host — corpus
  membership, the case-insensitive substring test, name/slug matching, one-result-per-document, snippet
  extent, and result ordering. The obligation that all four surfaces answer a query identically lives here.

### Modified Capabilities

- `search-api`: the `/api/openspec/search` endpoint's corpus and matching are restated as conformance to
  `search-semantics`; result ordering becomes deterministic rather than relevance-scored; a change appears
  once regardless of how many of its files match.
- `api-adapter`: `StaticAdapter.search()` conforms to the same rule, including task text from the embedded
  parsed structure.
- `custom-schema-artifacts`: the `ChangeDetail` artifacts contract gains the source file name on every root
  artifact, and the `tasks` artifact carries the file's raw content alongside its parsed structure.
- `openspec-scanner`: its "a discovered artifact is therefore always both counted and searchable" is
  narrowed to the root artifacts. The `specs` delta artifact is discovered, counted and rendered as a tab
  but deliberately not indexed, so the sentence as written would contradict the corpus rule the moment that
  exclusion stops being an accident and becomes a `SHALL NOT`.
- `search-ui`: the dialog states what a result must be able to explain — which artifact answered, and
  whether the change is archived — and identifies a result by its slug or topic rather than by its title.
- `core-module`: a new browser-safe subpath exporting the search rule, added to the subpath list the package
  publishes.
- `intellij-embedded-server`: `GET /api/spek/openspec/search` is restated as conformance to
  `search-semantics` rather than as its own description of full-text search.

## Impact

- **Code**: `packages/core/src/` (new module + subpath, `package.json` `exports`, build entry),
  `packages/web/server/routes/openspec.ts`, `packages/vscode/src/handler.ts`,
  `packages/web/src/api/StaticAdapter.ts`, `packages/intellij/src/main/kotlin/com/spek/intellij/core/SearchService.kt`.
- **Dependencies**: `fuse.js` leaves `@spekjs/web` and `spek-vscode` unless another caller remains.
- **API surface**: response shape is unchanged (`SearchResult` already lives in core types); the set and the
  order of results change. `@spekjs/core` gains a public export — additive, so a minor bump on its own
  version line when it is next published.
- **Verification**: the four implementations are one rule in two languages, which is the shape
  `test-fixtures/task-parser/` already exists for — a shared fixture corpus read by both the TS and Kotlin
  tests is the only thing that can hold them in agreement. Whether this change carries that corpus or a
  narrower set of cases is a design question.
- **Docs**: two capability Purposes contradict this change and a delta cannot edit a Purpose, so both are
  corrected directly at archive time — `search-ui`'s "client-side Fuse.js ranking", which no longer exists
  in `packages/web/src` at all, and `search-api`'s "returning ranked matches", which its own first
  requirement will forbid. CLAUDE.md's "search = server-side full-text + Fuse.js" goes with them.
- **Not covered**: the GitHub Action and demo inherit the static build's behaviour, so they are fixed by the
  `StaticAdapter` work rather than separately.
