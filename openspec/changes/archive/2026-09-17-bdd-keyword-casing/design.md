## Context

See proposal.md — Why, for what OpenSpec accepts and what specs in the wild actually contain.

Two facts about the existing renderer shape this design, and neither is obvious from the outside.

**The renderer never sees a line.** `processChildren` is wired to `p`, `li` and `strong` only
(`MarkdownRenderer.tsx:236-265`), and by then react-markdown has handed it React children, not
source text. A hard-broken Gherkin block — which is exactly the reporter's shape, three lines each
ending in two spaces — arrives as *one* paragraph whose children are `[<strong>Given</strong>,
" a project…", <br>, <strong>When</strong>, …]`. There is no line index, no column, and no cheap way
to recover one. Any rule phrased as "at the start of a line" would have to be implemented somewhere
else entirely.

**Headings are keyword-marked, but only when the keyword is emphasised — and this was believed
otherwise.** `processChildren` is wired to `p`, `li` and `strong`, which reads as excluding `h1`–`h6`;
`strong` is an inline element, so it runs inside a heading like anywhere else. Rendered through the
real component:

```
## **ADDED** Requirements  ->  text-badge-added     (marked, today)
## ADDED Requirements      ->  (no mark)
### **GIVEN** x            ->  text-kw-when         (marked, today)
```

CLAUDE.md's "no heading has ever been keyword-marked" is true of *this repository's content*, whose
delta headers are unemphasised, and false as a statement about the renderer. A heading is in fact the
one place where the only thing `processChildren` can reach **is** emphasis — which is exactly where
this change's relaxation would land if nothing stopped it.

The delta badges that render in ordinary content are prose mentions — `- **ADDED**: a new field` in a
proposal's What Changes list.

## Goals / Non-Goals

**Goals:**

- One rule covering every keyword group, stated so that a reader can tell which group a new keyword
  joins and why.
- A relaxation that reaches the affected repositories without marking ordinary prose.
- The rule's evidence recorded with it, so a later reader can disagree with the measurement rather
  than guess at the intent.

**Non-Goals:**

- Recognising an unemphasised step (`- Given the user is logged in`). Measured below and rejected.
- Any change to `extractHeadings`, to heading ids, or to anchors. The heading-label change is
  display-only and `extractHeadings` is already excluded from it by `core-module`.
- Changing which elements `processChildren` runs on. The heading guard is a test inside the existing
  `strong` handling, not a new entry in or removal from that list.
- A Kotlin mirror. Neither BDD highlighting nor `specHeadingLabel` has one — the IntelliJ tool
  window loads the same React SPA.

## Decisions

### A non-uppercase keyword is recognised only under emphasis

A keyword spelled in title case is highlighted when, and only when, it sits inside `<strong>` and the
strong run's entire text is that keyword. Uppercase keeps matching anywhere it appears, unchanged.

The alternative was a positional rule — first word of a paragraph or list item. Both were measured
over 300 `openspec/specs/**.md` files from 242 repositories, classified by whether the line sits in a
scenario body:

| candidate rule | in a scenario | outside one | what the outside hits actually are |
|---|---|---|---|
| emphasised, whole run (`**Given**`) | 450 | 29 | genuine steps, in a repo that writes them as bare bold lines under `### Feature:` rather than under a scenario header |
| leading word (`- Given …`, `When …`) | 148 | 63 | **ordinary normative prose** |

The leading-word figure counts the first word of a paragraph or list item, which is what a renderer
can see. Counting the first word of every *source line* instead gives 93, but a line that begins with
"When" only because the paragraph happened to wrap there is not a shape any rule could act on.

The outside hits are what settles it. For the emphasis rule they are all real steps. For the leading
word rule they are requirement sentences:

```
When the dashboard server spawns an RPC keeper for a headless pi session, the server SHALL …
When `value` is present and exceeds 255 bytes (the RFC 1035 TXT limit), …
```

Those sentences appear in *every* repository, not in the five that write title-case steps, so the
positional rule trades a defect affecting 2% of repositories for one affecting all of them.

The emphasis rule is also the one that does not guess. `**Given**` is the author writing "this word
is a label, not part of the sentence" in markup; spek reads that rather than inferring it from
position. It costs the 24% of wild non-uppercase steps that are written as bare bullets (151 of 630)
— a real limitation, recorded under Risks rather than argued away.

Two narrower variants were considered and rejected. *Keyword anywhere inside `<strong>`* would mark
the first word of a bolded clause (`**Given the user is logged in**`), where the word is prose inside
the emphasis rather than a label; the whole-run test is what distinguishes the two, and in the corpus
it costs nothing (both variants matched the same 479 runs). *Also accept `<em>`* has no support in
the data — every non-uppercase step found uses `**`/`__` — and `em` does not call `processChildren`
today, so it would widen the change for a form nobody writes.

### `MUST` / `SHALL` do not join the relaxation

They stay uppercase-only, and the spec now carries the reason instead of leaving them as one entry in
a uniform rule. OpenSpec matches them with a case-sensitive `/\b(SHALL|MUST)\b/` in every version
read, and `openspec validate --strict` exits non-zero on a requirement that contains no uppercase
`SHALL` or `MUST`, citing RFC 2119.

Be precise about what that check is, because the spec must not overstate it: it is a **presence**
test, not a rejection of the lowercase spelling. `The system shall do the thing, and it MUST also do
the other thing.` validates cleanly — OpenSpec never objects to the lowercase word, only to the
absence of an uppercase one, and the same warning fires for a requirement written with "will".

The argument is unaffected. Lowercase "must" is an ordinary English verb with no normative force, so
highlighting it red — the colour that means *normative* in this renderer — would assert something the
document does not say. This is the one keyword group whose casing carries meaning, so it is the one group whose
casing spek must not smooth over.

### Delta operations stay uppercase-only

The proposal originally relaxed them too, arguing they need no guard because they do not double as
ordinary prose. Both halves were wrong.

They do double as prose: 173 body-text occurrences of `removed`, `added`, `modified` and `renamed` in
their non-uppercase spellings (165 lowercase, 8 title-case) across the corpus, all ordinary words.
So an unguarded relaxation was never on.

The emphasis guard looked like it rescued them — **zero** of those 173 is an emphasised whole run.
But the corpus is `openspec/specs/**.md`, and a delta badge does not render in a spec. It renders in
prose that *mentions* an operation, which is a proposal, and the measurement excluded the one
document type the decision is about. Three of this repository's own archived proposals write exactly
the shape the guard admits:

```
archive/2026-08-05-add-ci-and-npm-publish-automation/proposal.md:83   **Modified**: root `package.json` …
archive/2026-08-06-add-task-parser-fixture-corpus/proposal.md:70    - **Modified**: `packages/core/src/tasks.test.ts` …
archive/2026-08-09-spec-content-comprehension/proposal.md:100       - **Modified**: `packages/web/src/components/MarkdownRenderer.tsx` …
```

`**Modified**:` there heads an impact list. It names no delta operation, and under the relaxation all
three would take the blue MODIFIED badge. One of those files is embedded verbatim in
`docs/demo.html`, so the mistake would ship to the live demo at the next release.

The emphasis guard works for the step keywords because a bold run holding nothing but `Given` is, in
practice, a step. It does not work here because `**Modified**:` as a section label is exactly as
common as `**Modified**` as a delta mention — the markup cannot tell them apart, and neither can a
colon test, since every occurrence above carries one.

So the delta operations keep the uppercase-only rule they have, and the change is exactly what issue
#53 asks for. What is lost is the "one rule for every keyword" symmetry — but that symmetry was
already false: `specHeadingLabel` goes to full case-insensitivity while the renderer stops at title
case, because the two answer to different things. OpenSpec's v1.4.0 relaxation was to `DELTA_HEADER`,
i.e. to the `## added Requirements` heading — and headings are where this renderer must not mark
anything at all.

### A keyword inside a heading is not marked

`## **ADDED** Requirements` renders a badge today, and `## ADDED Requirements` — the form every spec
actually uses — does not. That asymmetry is an accident of `strong` being an inline component, not a
decision anyone made, and it has been invisible because no OpenSpec document emphasises a delta
header.

Admitting title case would make it visible: `## **Added** Requirements` would begin to badge where it
never did. Rather than inherit an accident and widen it, the rule states that no keyword is marked
inside a heading, in any spelling. That preserves what readers see today for every unemphasised
heading, which is all of them in practice, and removes the emphasised case rather than extending it.

The alternative — leave headings alone and accept whatever the relaxation does there — was rejected
because it makes the feature's blast radius depend on a wiring detail nobody documented. The guard
costs one test in the `strong` handler, which is the same place the whole-run test already has to
live.

### `specHeadingLabel` becomes case-insensitive with no guard

`SPEC_HEADING_KEYWORD_RE` gains `/i`. No positional test is needed and none would make sense: the
regex is already anchored at the start of the heading text and already requires the immediately
following colon, so `requirement:` at position 0 is as unambiguous as `Requirement:` is. The word
cannot collide with prose there — a heading beginning `Optional Requirement:` is excluded by the
anchor, and `core-module` already pins that case.

What changes alongside it is the *rationale*. The current clause justifies exactness by saying a
variant "OpenSpec's own parser would not accept" must not be elided. OpenSpec's parser accepts it:
`REQUIREMENT_HEADER_REGEX` gained `/i` at v1.4.0 (1.3.1 does not have it, 1.4.0 does), and the
`Scenario:` keyword the same rule names has been folded case-insensitively since v1.9.0 — before
that, scenario recognition read no keyword at all, so a lowercase `#### scenario:` always parsed.
Verified against the installed CLI: a spec using `## requirements`, `### requirement:` and
`#### scenario:` passes `openspec validate --strict`. Leaving the behaviour while the stated reason is false is worse than either changing it or
keeping it deliberately — the next reader would follow the reason to the wrong conclusion somewhere
else.

The existing `A case variant is returned unchanged` scenario inverts. Its replacement asserts the
elision, and the neighbouring scenarios that pin the anchor and the keyword-only case stay as they
are, because neither depends on casing.

### The keyword table stops being keyed by spelling

`BDD_KEYWORDS` / `BDD_WEIGHTS` are keyed by the uppercase spelling, and `BDD_PATTERN` is built from
`Object.keys(BDD_KEYWORDS)`, so *what matched* and *which keyword it is* are the same string today.
Under this change they separate: a match of `Given` must find `GIVEN`'s styling. The match is
normalised to its uppercase spelling for lookup, and the matched text is what gets rendered — spek
displays what the file says, so a title-case step renders as `Given`, not silently re-cased to
`GIVEN`.

The keyword table also has to say which group a keyword belongs to, since `MUST`/`SHALL` now behave
differently from the rest. Keeping that as a second list of names beside the table is how the four
delta operations came to be two handled and two not; it belongs in the table, so that adding a
keyword forces the choice.

## Risks / Trade-offs

**A bare-bullet title-case step stays unhighlighted** (151 of 630 non-uppercase steps in the corpus,
24%) → Accepted, and stated in the spec as a limit rather than left to be discovered. The rule is
legible to an author: emphasise the keyword and it is marked, which is also what 95.5% of specs
already do. The alternative marks normative prose in every repository, which is a worse defect than
the one being fixed.

**The corpus is a GitHub sample, not a census, and it is specs only** → 300 `openspec/specs/**.md`
files across 242 repositories, taken from code search and counted locally because GitHub's search
folds case. It is large enough to establish that title-case steps exist, that they are concentrated
in whole repositories rather than mixed within a file, and that below title case the same markup
shape means something else. It cannot establish exact proportions for the population — and, as the
delta-operation decision found the hard way, **it says nothing about `changes/**`**, where proposals
and designs live and where several of the marked words appear in a different role. A question about
how a word is used in a proposal cannot be answered from this corpus. Every figure here is quoted
against the sample, so a later reader can re-take it and disagree.

**A behaviour change ships to `@spekjs/core` consumers** → `specHeadingLabel` returns something
different for an input differing only in case. The signature is unchanged and no caller of it in this
repo derives a value from the result, but it is a public export, so it belongs in
`packages/core/CHANGELOG.md` at release time — as a minor, not a patch.

**`AND` is the highest-collision word of the four, and the case floor is what holds it** (194 of the
479 emphasised non-uppercase hits) → `**And**` as a whole bolded run is not ordinary prose anywhere in
the sample, but `**and**` is: three occurrences, all emphasis inside a sentence
(`… intake **and** story grilling …`). Same word, same markup shape, and only the refusal to go below
title case separates them. So "no spelling below title case" is load-bearing rather than tidy, and
the honest statement of the emphasis rule is not that emphasis marks a label — it is that a bold run
holding *nothing but a title-case step keyword* is, in this corpus, always a step. Any future
loosening should be measured against `and` first, not against `Given`.

**Contrast obligations are unchanged** → No colour, token or alpha moves. A title-case keyword uses
its group's existing styling, so `contrast.test.ts` and its declared table are untouched. Worth
stating because "adding a mark means adding both themes' values" is a standing rule here, and this
change adds no mark.
