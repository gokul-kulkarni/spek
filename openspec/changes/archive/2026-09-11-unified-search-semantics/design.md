## Context

See proposal.md — Why. The facts that shape the approach:

- Three of the four implementations read the filesystem; `StaticAdapter` has no filesystem, only the
  embedded `ChangeDetail` records. So the corpus cannot be produced by one function.
- The embedded payload is typed `Record<string, ChangeDetail>` — the static build ships exactly what
  `readChange` returns. Anything search needs there has to be on that type, not beside it.
- A `tasks` artifact carries `tasks: parseTasks(content)` and no `content`, which is #52.
- IntelliJ already iterates a change's files in `rootArtifacts` order rather than name order, with a
  recorded reason: a query that matches a change's slug matches every one of its files, so the first file
  iterated is the one that supplies the snippet, and name order previewed raw YAML instead of design prose.
- `parseSlug` (the `2026-09-10-foo-bar` → `foo bar` title rule) lives in `scanner.ts`, which imports
  `node:fs`. The static build cannot reach it, which is why it is the one surface showing raw slugs.
- The dialog renders `result.title` and `result.context` only, highlighting the query in both, and keys a
  change row by its title. So a result the reader cannot see a reason for is a real outcome, not a
  theoretical one, and two changes sharing a description collide on the key.
- Kotlin skips dot-directories when walking specs and changes; the web route and the VS Code handler do
  not. `StaticAdapter`'s payload comes from the scanner, which also skips them.

## Goals / Non-Goals

**Goals:**

- One stated rule for the corpus, the match test, the snippet, and the order, in core, with Kotlin
  mirroring it — so the four surfaces answer a query identically.
- The static build's corpus is the *same text* as the file-reading hosts', not an approximation of it.
- The two unavoidable corpus producers (from files, from embedded objects) are pinned against each other
  by a test rather than by review.
- Every result the rule returns can be explained to the reader by the dialog that shows it — which artifact
  answered, and why this row is here at all.

**Non-Goals:**

- Any search index, cache, or incremental update. Every surface rescans per query today; this change does
  not make that better or worse.
- Unicode normalisation. Neither runtime normalises, so NFC and NFD text still fail to match each other —
  identically on every surface, which is all this change claims.
- Aggregation. Search reads one working directory's `openspec/`, as today on all four surfaces.
- Ranking. Order becomes deterministic, not relevance-ordered; no surface gains a score field.
- Searching the change's delta `specs/` tree. Excluded today everywhere, and stays excluded — now as a
  stated decision rather than four coincidences.

## Decisions

### D1. The corpus is a list of documents; producing it is host-specific, matching it is not

Core gains a browser-safe `@spekjs/core/search` subpath holding the rule: the document shape, the match
test, snippet extraction, the title rule, and `searchDocuments(docs, query): SearchResult[]`. It touches no
`node:` module, so `StaticAdapter` can import it.

Two producers feed it, because the two inputs genuinely differ:

- `collectSearchDocuments(basePath)` — Node, on the package index. Walks `openspec/specs/*/spec.md` and each
  change's `rootArtifacts`, reading file text. Used by the Web server and the VS Code host.
- `changeSearchDocuments(detail)` / `specSearchDocument(topic, content)` — browser-safe, over the embedded
  `ChangeDetail` records. Used by `StaticAdapter`.

*Alternative considered*: have the Node hosts call `discoverArtifacts` and use the object producer
everywhere, collapsing the two into one. Rejected: `discoverArtifacts` also reads the whole delta `specs/`
tree, which search then discards, so every query would pay I/O for text it cannot return.

*Alternative considered*: keep four implementations and fix each to the same written rule. Rejected — that
is the current state with better prose.

### D2. `ChangeArtifact` gains `content` on the tasks artifact and `file` on every root artifact

`content` is what makes the static corpus identical rather than approximate. Flattening the parsed
structure instead (the reporter's first suggestion, and the zero-byte option) recovers 93.8% of the
characters in the 99 archived `tasks.md` files. The 44 non-blank lines it drops — 1.5% — are not one
construct but five: 14 column-0 blockquote callouts, 12 bare prose paragraphs, 8 bullets, 6 indented
continuations and 4 column-0 ATX headings. The largest single cluster is a 14-line post-implementation
review block in `2026-08-08-add-schema-browsing/tasks.md`. So the loss is not a tidy category one could
decide to live without; it is whatever prose the task grammar does not claim. A rule of "the corpus is the
file's text" is also far cheaper to verify than "the corpus is whatever the parser kept".

Measured cost of carrying both, by injecting each change's real `tasks.md` into the committed
`docs/demo.html` payload and gzipping the result: **+26.7 kB gzipped**, **+2.28%** of the 1.17 MB baseline.
Adding `file` to every root artifact brings it to roughly +27 kB / +2.3%. Most of the raw text dedups —
the same 291 kB of markdown is 115 kB gzipped standalone — because each raw copy sits next to its own
parsed copy, inside gzip's 32 kB window.

`file` (the source filename at the change root) is what lets both producers sort by the same key. It is
absent on the `specs` artifact, which has no single file and is not indexed.

*Alternative considered*: carry the raw text in `DemoData` beside `changeDetails` rather than widening the
shared artifact type. `DemoData` already holds `specVersions`, `graphData`, `schemas` and `schemaDetails`
beside it, so there is no rule against this — an earlier draft of this design claimed the payload's being
typed `Record<string, ChangeDetail>` forced the field onto the shared type, which the file disproves. It is
rejected on its merits instead: it is a static-build-only shape, so the two producers would read different
fields for the same text, which is the class of divergence this change exists to remove. The cost it avoids
is real but small — a change-detail response and a VS Code `postMessage` each carry roughly 3 kB more, on
localhost.

*Alternative considered*: carry only `content` and call `parseTasks` in the browser, which would make the
payload *smaller* than today (the parsed JSON is 1.13x the markdown). Rejected for now: it breaks the
payload-is-`ChangeDetail` identity, forcing `StaticAdapter` to transform on every read and `DemoData` to
grow a type of its own. Worth revisiting if payload size ever becomes the binding constraint.

*Alternative considered*: derive the sort key from `title` instead of adding `file`. Rejected: `title` is
humanised (`design.md` -> `Design`) and the data bucket's title is the bare filename, so the two producers
would be sorting by keys that only coincidentally agree.

### D3. Match test: case-insensitive substring, with every boundary the runtimes could decide stated

A document matches when its lowercased text contains the lowercased query. A spec also matches on its topic
and a change on its slug — **and on the humanised form of either**, because that is what the reader is
shown: a result card reads `unified search semantics`, and a rule matching only the hyphenated slug turns
the most natural follow-up query into no results. Fuse's fuzziness used to absorb that substitution; exact
matching has to state it. The query is trimmed before both the blankness test and the match.

Four boundaries are stated rather than inherited, because each is a place a runtime would otherwise decide:

- **Case folding is applied one UTF-16 code unit at a time**, not to the whole string, and uses the
  locale-independent mapping on both sides — JavaScript's `String.prototype.toLowerCase` per unit,
  Kotlin's `Char.lowercaseChar()`. `toLocaleLowerCase`, `lowercase(Locale)` and Java's
  `String.toLowerCase()` are forbidden: under a `tr-TR` default locale they fold `I` to `ı`, so the same
  repository would answer differently depending on the machine's locale. This is issue #33's rule — the
  parser never lets its runtime decide a boundary — applied to case folding rather than line endings.

  Folding *per unit* rather than per string is the same rule applied once more, and implementation found
  it: whole-string folding is where the two runtimes actually diverge. `ß` folds to `ss` in JavaScript and
  stays put in Java; `İ` (U+0130) expands to two code units in JavaScript and collapses to `i` in Java.
  Per-unit folding is `Character.toLowerCase` on both sides. It is also length-preserving, which is what
  makes the offset rule below implementable at all rather than needing an index map.
- **The guarantee is exact for ASCII and best-effort beyond it.** The two runtimes fold at their own
  Unicode versions (the JS engine's and the JDK's), which differ across releases. Stating agreement for all
  of Unicode would make the shared corpus go red on a Node or JDK bump with nobody's code having changed,
  so non-ASCII fixtures are restricted to mappings stable since Unicode 5.1.
- **Ordering comparisons are UTF-16 code-unit order**, never `localeCompare` or a `Collator`. This is not
  hypothetical: `listSpecFiles` sorts topics with `localeCompare` today while Kotlin uses `sortedBy`, and
  ICU collation weakens `-`, so the two already disagree on `spec-diff` against `specdiff`.
- **Offsets are counted in UTF-16 code units and index the original text**, with a cut nudged off a
  surrogate boundary. Because the fold is length-preserving, an index into the folded text *is* an index
  into the original; under whole-string folding it is not, and every snippet after a `İ` misaligns — which
  is what `SearchService.kt`'s `extractContext` does today.

Matching is not approximate. A query that does not occur verbatim produces no match, and one that does
produces a match wherever it sits — never weighted or discarded by distance from the start of the text.
Unicode normalisation is not applied, consistently everywhere.

An **absent** `q` returns HTTP 400; a present but blank one returns an empty array. Today only the web
server returns 400 at all: the IntelliJ route defaults a missing `q` to `""` and answers `200 []`, and the
VS Code host rejects its promise. The design brings all three to the same rule rather than recording the
split as unchanged, as an earlier draft wrongly did. The web guard must test for the parameter being
absent, not for falsiness — `if (!q)` cannot tell `?q=` from no `q` at all — and must reject an
array-valued `q` (`?q=a&q=b`) rather than calling a string method on it.

### D4. One result per spec and per change, from the first document that actually contains the query

Documents are ordered: all specs by topic; then active changes by slug; then archived changes by slug
**descending**, so the newest is first. Archived slugs carry a `YYYY-MM-DD-` prefix and active ones do not
(the prefix is added at archive), so ascending order would put 2026-02's changes above this month's, and
search would be the one view in spek showing oldest-first while every list sorts newest-first. Active
changes have no date to sort by, so theirs is alphabetical. Within a change, `rootArtifacts` order —
markdown and tasks by filename, then data by filename.

A spec or change yields at most one result, taken from the first of its documents whose **text** contains
the query. Only when no document does — a topic or slug match alone — does the first document supply the
result. Selecting the first *matching* document instead, as IntelliJ does today, is subtly wrong: a slug
match makes every one of that change's documents match, so the change's own `tasks.md` occurrence is
discarded in favour of a head-of-`design.md` snippet containing nothing the reader typed, and the UI
highlights nothing in either title or context. IntelliJ's recorded reason for its file order is preserved —
it decides which document answers a name-only match — while the case where a real occurrence exists is
fixed rather than propagated to two more surfaces.

Results carry the source filename, and carry whether the change is active or archived, so the dialog can
tell a reader which of 99 archived changes it just offered them.

The snippet is up to 100 code units either side of the first occurrence, marked at each cut end. For a
name-only match it is the head of the first document, capped at 200. Titles come from `parseSlug`, which
moves to the browser-safe module so `StaticAdapter` stops showing raw slugs; `scanner.ts` imports it from
there.

### D5. Fuse.js is removed, not reconfigured

`ignoreLocation: true` would close #51 while leaving fuzzy matching on two surfaces and exact matching on
the other two. Since the decision is one rule everywhere, and bringing Fuse to the other two means shipping
it in the static payload *and* writing a fuzzy matcher in Kotlin — a second hand-mirrored rule, which is
what this change exists to stop — the dependency goes. `fuse.js` is dropped from `@spekjs/web` and
`spek-vscode`; nothing else imports it (`packages/web/src` has no Fuse at all, despite what `search-ui`'s
Purpose still says).

### D6. The rule is two languages, so it gets a shared fixture corpus

`test-fixtures/search/` follows `test-fixtures/task-parser/`'s shape: one JSON file per case (`name`,
`note`, `input` documents, `query`, `expected` results), read in full by a TS test and a Kotlin test, with
the same **printable-ASCII-plus-escapes** guard on inputs — more necessary here than for the task parser,
since the interesting cases are case folding over non-ASCII.

Deliberately narrower than the task-parser apparatus: **no generator and no `invalid/` loader corpus**. The
task parser's cross-language traps came from line-boundary and blank-line definitions that differ between
the runtimes; search's rule has one such trap (case folding, D3) and otherwise runs on UTF-16 code units in
both languages, where they already agree. A randomised disagreement detector has correspondingly little to
find.

Omitting `invalid/` has a consequence that has to be accepted rather than worked around: each loader's
rejection is asserted only as *a* rejection, never as a particular message. Requiring the two to produce the
same wording is exactly the loader-parity obligation `invalid/` exists to hold, and pinning it with two
hand-copied strings and nothing keeping them equal is the failure `task-parser-fixture-corpus` was written
about. If message parity is ever wanted here, the answer is `invalid/`, not a pair of literals.

Separately, one test pins D1's two producers against each other: the documents `collectSearchDocuments`
yields for spek's own `openspec/` must equal those `changeSearchDocuments` yields for the same changes read
through `readChange`. That is the seam this design creates, so it is the seam that gets a test.

## Risks / Trade-offs

- **Fuzzy matching disappears; a typo that used to find something now finds nothing** → Accepted and
  user-visible. It is what the other two surfaces already did and what #51's reporter expected, and the
  fuzzy path was unreliable anyway — the location bias meant it silently failed on exact matches. Belongs
  in the release notes as a behaviour change, not a bug fix.
- **Two corpus producers can drift** → The cross-check test in D6. It is the whole reason that test exists.
- **Kotlin and TS can drift** → The shared fixture corpus in D6.
- **Payload grows** → +1.7% gzipped, measured (D2). The alternative that would shrink it is recorded there.
- **`@spekjs/core` gains public exports and `ChangeArtifact` gains fields** → Additive, so a minor bump on
  core's own version line when it is next published. Registry consumers are unaffected.
- **Substring scan allocates a lowercased copy of every document per query** → What the static build and
  IntelliJ already do, and a net improvement on the two surfaces losing Fuse: one bitap index per query
  becomes one lowercase plus `indexOf` per document. At spek's own size — 355 documents, 1.76 MB of text
  across `openspec/specs/` and every change's root files — this is not measurable against the file reads it
  follows. No index is introduced (Non-Goals).
- **A one-character query now matches almost every document, deterministically** → Not a regression (Fuse
  behaved similarly), and no result cap is introduced. If the dialog needs one it is a UI decision, not a
  property of the rule.
- **Aggregation is out of scope, and this change makes the gap more visible** → Search reads one working
  directory while the changes list aggregates across worktrees by default. After this change every surface
  advertises finding a change by its name, so a change whose winning copy lives in another worktree is
  indexed from the main worktree's copy: the snippet can be text the change-detail page does not show, and
  a term present only in the winning copy is unfindable. Stated here rather than left implicit in
  Non-Goals.
- **A change whose slug matches will now match even on surfaces that only indexed content** → More results
  than before on Web and VS Code for slug-shaped queries. Intended: it is what the other two surfaces did,
  and searching a change by its own name finding nothing was itself a defect.
