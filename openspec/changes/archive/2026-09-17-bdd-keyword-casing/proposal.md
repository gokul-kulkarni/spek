## Why

spek's keyword matching is case-sensitive everywhere, and it applies one rule to keywords that do
not carry the same obligation. A reporter's spec written with title-case Gherkin steps
(`**Given**` / `**When**` / `**Then**`) renders with no highlighting at all (issue #53), and it is a
spec `openspec validate --strict` accepts without a warning.

The reason each rule is stated as case-sensitive was OpenSpec's own strictness. That premise holds
for one keyword group and has expired for another. Reading 24 published `@fission-ai/openspec`
versions sampled across the 49 on npm, from 0.1.0 to 1.13.1 and bracketing each boundary claimed
here:

- `### Requirement:` and `## ADDED Requirements` are matched with `/i` since **v1.4.0** (1.3.1 does
  not have it) — `### requirement: Foo` parses, and `openspec validate --strict` passes it. The
  `Scenario:` keyword has been folded case-insensitively since v1.9.0; before that no keyword was
  read there at all.
- `SHALL` / `MUST` are matched by `/\b(SHALL|MUST)\b/` in every version read. The check is a
  **presence** test: `--strict` exits non-zero on a requirement containing no uppercase `SHALL` or
  `MUST`, citing RFC 2119 — it does not object to a lowercase `shall` beside an uppercase keyword.
- `WHEN` / `GIVEN` / `THEN` / `AND` have **never** been parsed in any version. A scenario body is
  `rawText` — free text. Uppercase appears only in schema templates, validation-message examples and
  the README, i.e. as guidance with nothing enforcing it.

So spek's tolerance should be decided per keyword group, against what OpenSpec actually does with
each. `core-module`'s heading-label requirement already says this in as many words — a variant
"OpenSpec's own parser would not accept" must not be elided — and is case-sensitive on a reading of
the parser that stopped being true at v1.4.0.

For the step keywords, where OpenSpec declines to have an opinion, the evidence is usage. Across 300
`openspec/specs/**.md` files from 242 repositories on GitHub, counted locally because GitHub code
search folds case:

```
~14,100 step keywords: UPPERCASE ~95%, other 630
non-uppercase spellings: And 207 / When 158 / Then 135 / Given 130 — all title case
all-lowercase steps: 3, and all three are prose emphasis, not steps
repos with any title-case step: 6 of 241 (2%)  — 5 of them have no uppercase step at all
```

The shape of that distribution decides the change. It is not that ~5% of keywords lose their colour;
it is that a small minority of repositories get **no highlighting whatsoever**, because an author who
writes title case writes it throughout. Title case is also the floor: the three all-lowercase
occurrences are `**and**` emphasised inside a sentence, the same markup shape carrying a different
meaning. So the rule stops there, and does not reach the ordinary prose words `and`, `when` and
`then` that full case-insensitivity would flood the view with.

## What Changes

- **BDD step keywords (`WHEN` / `GIVEN` / `THEN` / `AND`) are highlighted in title case as well as
  uppercase.** Title case is recognised only where the author's own markup sets the word apart — a
  bold run whose whole text is the keyword — so a requirement sentence beginning "When the server
  spawns…" is untouched. Uppercase keeps matching wherever it appears, as now. See design.md for the
  measurement that rejected a positional rule.
- **`MUST` / `SHALL` continue to match uppercase only**, and the spec now says *why* rather than
  leaving it as one entry in a uniform rule: OpenSpec requires an uppercase spelling to be present,
  and RFC 2119 gives lowercase "must" no normative force. This is the keyword whose casing carries
  meaning, so it is the one spek must not smooth over.
- **The delta operations (`ADDED` / `MODIFIED` / `REMOVED` / `RENAMED`) also continue to match
  uppercase only**, and the spec now says why. `**Modified**:` heads an impact list in three of this
  repository's own proposals and names no delta operation there; the emphasis rule cannot tell that
  apart from a mention of the operation, because both are written identically. OpenSpec's own
  relaxation here was to the `## added Requirements` *heading*, which is the one place this renderer
  must mark nothing at all.
- **No keyword is highlighted inside a heading, in any spelling.** This is stated because it is not
  what the renderer does today: `strong` is an inline component, so `## **ADDED** Requirements` is
  marked while the unemphasised form every spec actually uses is not. Admitting title case would
  widen that accident; the rule closes it instead, leaving what readers see unchanged in practice.
- **`specHeadingLabel` elides `Requirement:` / `Scenario:` without regard to case**, following
  OpenSpec's own parser. This corrects a requirement whose stated rationale — that OpenSpec's parser
  would reject the variant — no longer describes OpenSpec.
- The spec's existing `Case-sensitive matching` scenario is rewritten in place. A single rule covering
  every keyword is what made the current behaviour look deliberate for all four groups when only some
  of them had a reason.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-renderer`: the `BDD keyword highlighting` requirement gains a per-group casing rule and a
  heading rule. Step keywords match in title case inside a bold run that holds nothing else;
  `MUST` / `SHALL` and the delta operations stay uppercase-only, each with its reason stated; no
  keyword is marked in a heading. The blanket `Case-sensitive matching` scenario is rewritten rather
  than dropped — OpenSpec refuses a `MODIFIED` that omits a scenario the current spec still has, so
  the name stays and its body states what survives.
- `core-module`: the `Spec heading display label utility` requirement's exact-match clause becomes
  case-insensitive, and its rationale is restated against what OpenSpec's parser actually accepts.
  `A case variant is returned unchanged` is likewise rewritten in place, for the same reason.

## Impact

- `packages/web/src/components/MarkdownRenderer.tsx` — `BDD_KEYWORDS` / `BDD_WEIGHTS` are keyed by
  the uppercase spelling and `BDD_PATTERN` is built from those keys, so the pattern and the lookup
  both need to separate *what matched* from *which keyword it is*. The `strong` component gains the
  two tests the relaxation needs — whether its content is a bare keyword, and whether it sits in a
  heading — because `highlightBddKeywords` sees one text run at a time and can answer neither.
- `packages/core/src/headings.ts` — `SPEC_HEADING_KEYWORD_RE` gains `/i`. No Kotlin mirror exists;
  `specHeadingLabel` has no counterpart under `packages/intellij`.
- Three surfaces display heading labels — the rendered content, the spec TOC and the VS Code tree —
  and all three go through `specHeadingLabel`, so the heading-label change reaches them without
  per-surface work.
- Not affected, and worth recording so the next reader does not re-derive it: `foldSections.ts`
  groups by heading *level* and never reads the keyword; search is a case-insensitive substring rule
  that has no keyword vocabulary; `extractHeadings` is explicitly excluded from the label rule, so
  every existing anchor and deep link is unchanged.
- No registry-consumer API changes. `specHeadingLabel`'s signature is unchanged; its behaviour on an
  input that differs only in case changes, which is a behaviour change for `@spekjs/core` consumers
  and belongs in that package's release notes.
