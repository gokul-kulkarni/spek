## Context

`scripts/build-demo.ts` builds one HTML document by template-literal interpolation of four values:
the page title into `<title>`, the payload into `<script>window.__DEMO_DATA__ = …;</script>`, the
Vite bundle into a second `<script>`, and — when Vite emits one — a CSS file into `<style>`. None is
escaped. The demo build currently emits no CSS file (Vite's IIFE output injects the stylesheet from
the bundle), so the `<style>` path exists but is dormant.

What the HTML tokenizer does inside those elements decides the design:

- `<title>` is **RCDATA**: only `</title` ends it, and character references are decoded.
- `<script>` is **script data** — for every `type`, including `application/json`. `</script` ends
  it, case-insensitively, when followed by whitespace, `/` or `>`. `<!--` enters an *escaped* state;
  inside that, `<script` followed by whitespace, `/` or `>` enters a *double-escaped* state, where
  `</script` no longer ends the element — it only steps back out, and the element runs on into
  whatever follows. That is how `<!--` then `<script>` in the payload merges the data script with the
  bundle script after it.
- `<style>` is **raw text**: only `</style` ends it.

Today's bundle contains all three of the sequences a naive check would ban, and each is inert where
it sits. React DOM's `"<script><\/script>"` holds the first `<script`, before any `<!--`, where plain
script data ignores it. highlight.js's HTML grammar holds `<!--`, `-->` and `/<script(?=\s|>)/`, whose
`<script` is followed by `(` and so cannot enter the double-escaped state. The minified bundle writes
its two `</script` and one `</style` as `<\/script` / `<\/style`.

`scripts/` has no test runner, and `build-demo.ts` runs the whole build at import time, so nothing
in it can be imported by a test as it stands.

## Goals / Non-Goals

**Goals:**

- No payload or title value, however it is spelled, changes the structure of the generated document.
- A bundle that would change it stops the build with an error naming the bundle.
- One check that states the property directly — "the document parses into the elements we wrote,
  with the text we wrote" — rather than a list of sequences believed to be dangerous.

**Non-Goals:**

- Detecting a page that is structurally intact but fails at runtime. The check is about structure;
  whether the bundle's JavaScript runs is CI's build and smoke jobs' concern, as it is today.
- `action.yml` interpolating inputs into shell scripts (#56) — a different layer, verified
  differently.
- The payload's shape or `StaticAdapter`'s contract; the viewer receives the identical value.
- `specs[].path` still carrying the builder's absolute path (a known, separate cleanup).
- The VS Code and IntelliJ hosts, which never inline data into HTML.

## Decisions

### D1. The payload escapes `<` and nothing else

`JSON.stringify(payload).replace(/</g, "\\u003c")`. JSON's structural tokens contain no `<`, so
every `<` in the output is inside a string literal, where `\u003c` denotes `<` to both JavaScript and
JSON. Without `<` there is no `</script`, no `<!--` and no `<script`, which are the only sequences
that move the script-data tokenizer out of its plain state. The one other character script data
treats specially, U+0000, never appears raw: `JSON.stringify` escapes every control character.

Alternatives:

- **Escape only `</` (as `<\/`)** — leaves `<!--` then `<script>`, the double-escaped case.
- **The broad set other serialisers use (`<`, `>`, `/`, `&`, U+2028/U+2029)** — `>`, `/` and `&` do
  nothing in script data. U+2028/U+2029 have been legal in string literals since ES2019, and the
  viewer's own bundle needs a far newer engine than that, so the escapes would only grow the file.
- **`<script type="application/json">` read with `JSON.parse`** — the element is still script data,
  so it needs the same escape; the move would only change `StaticAdapter`'s contract for nothing.

### D2. The title is HTML-escaped (`&`, `<`, `>`)

Escaping `<` keeps `</title` out of RCDATA; escaping `&` keeps a title such as `R&amp;D` from being
decoded into something the author did not write. `>` is escaped because a text escaper that leaves
it out invites the question of whether it was forgotten. The default title is unaffected.

### D3. The assembled document is parsed and compared, and a mismatch fails the build

After assembly, the document is parsed with **parse5** (the WHATWG-conformant parser jsdom uses),
and the build requires that it contains exactly the `<title>`, `<script>` and `<style>` elements the
assembler emitted, in document order, each with exactly the intended text. Otherwise it throws and
nothing is written.

The error names the **first** divergence in document order — the title, the payload, the script or
the stylesheet. That is what makes the name point at the cause: a stylesheet carrying
`</style><script>…` produces an extra script *after* it, and reporting a count mismatch, or the extra
element, would blame the wrong part.

The check covers all four interpolations. For the bundles it is the only guard. For the payload and
the title it is a second line behind D1/D2 — a mismatch there means the escaping is wrong, and the
message says so rather than blaming the content. That branch is unreachable through the assembler
while D1/D2 hold, so the verifier is exported on its own, and its tests feed it the raw documents
from #54.

Before comparing, the intended text is normalised the way the HTML input stream is (CRLF and lone
CR → LF). The browser does the same, so that difference is not one the build introduced. A raw
U+0000 is *not* normalised away: the parser turns it into U+FFFD, which changes the script, and it
fails.

Alternatives:

- **Ban substrings** (`</script`, `<!--`, `<script`) — banning `<!--` or `<script` fails today's
  build; banning only `</script` misses the double-escaped case. The danger is a sequence of
  tokenizer states, not a string.
- **Hand-write the script-data states** — about six states with a case-insensitive tag-name buffer
  and a terminator rule. That is a second copy of a rule the HTML standard owns, and this repository
  has already paid for hand-copied rules drifting apart (the task parser, search). parse5 *is* the
  rule.
- **Rewrite the bundle** (`</script` → `<\/script`) — valid only inside string, regex and template
  literals; in code it changes or breaks the program. The bundle is our own output, and the right
  response to an unsafe one is to stop, not to edit JavaScript we have not parsed.

**parse5 becomes a root devDependency.** It is already in the lockfile at 7.3.0, pulled in by
`@vscode/vsce` → `cheerio`, so no new package is downloaded; declaring it stops the check depending
on vsce's transitive choice. The Action's `npm ci` installs devDependencies, which is how `tsx` and
`vite` already reach it. Parsing the current 4.5 MB demo takes about 0.4 s, beside a Vite build that
takes seconds.

### D4. Assembly moves to a pure module, tested under `npm test`

`scripts/demo-html.ts` holds the serialiser, the title escaper, the verifier, and an
`assembleDemoHtml` that returns the verified document or throws. It imports nothing from
`packages/core/dist` and does nothing at import time, so its tests need no core build.
`build-demo.ts` keeps everything else and calls it. Its temporary `packages/web/dist-demo/` — which
is not gitignored — is removed in a `finally`, so a failed check leaves no untracked output behind.

Tests live in `scripts/demo-html.test.ts` and run with `node --import tsx --test`, the idiom the core,
ui and web suites use. The root `npm test` script gains that step, so CI runs it with no workflow
change — CI runs exactly the repository's scripts. `tsconfig.scripts.json` and the lint glob already
include `scripts/`, test files with them.

The round-trip oracle is **evaluation, not `JSON.parse`**: the viewer receives the result of
evaluating an object literal, which differs from `JSON.parse` on a `__proto__` key. The tests run
the parsed data script in a fresh `vm` context and compare what it assigns.

Test inputs spell `<script>` with its `>`: `<!--` then `<script(` would *not* trip the check, and a
test written that way passes against a broken implementation.

The cases, each chosen for a specific failure:

- payload: `</script>`, `</SCRIPT >`, and `<!--` then `<script>` all parse to one intact data script
  whose evaluated value deep-equals the original;
- title: markup and a character reference read back literally;
- bundle: an unescaped `</script>` fails naming the script; `<!--` then `<script>` with no `-->`
  between fails; today's three inert forms (`<script>` before any `<!--`, and `<!--` / `-->` /
  `<script(`) pass — which pins the check to the parser's rules rather than to a substring ban;
- stylesheet: `</style>` fails naming the stylesheet, and `</style><script>x</script>` names the
  stylesheet, not the script it produced;
- verifier: the raw documents from #54 fail naming the payload.

The real bundle goes through the check on every pull request: CI's discarded demo build and the
action smoke job both run `build-demo.ts`. Once this change is merged, its own artifacts put all
three dangerous payload forms into this repository's payload, so those same runs exercise D1 on real
content.

## Risks / Trade-offs

- [A future bundle trips the check] → it fails CI's demo build and the action smoke job on the pull
  request that introduces it, before it reaches `master`, which is what consumers build. The fix
  belongs in whatever source emitted the sequence.
- [A consumer's build newly fails] → only spek's own bundle can trip the check; payload and title are
  escaped, so no consumer content can. If the escaping itself were wrong, the build would fail rather
  than publish a page that cannot boot — the intended trade.
- [parse5 and browsers disagree] → parse5 implements the WHATWG tokenizer and is what jsdom runs.
  parse5 and Chrome agreed on every payload and bundle case while this change was reviewed.
- [The smoke job does not cover the HTML's content or the `title` input] → per CLAUDE.md, the action
  is verified by hand with a temporary workflow on the pull request branch, removed before merge.

## Migration Plan

None. Merging reaches Action consumers at once (`spek-version` defaults to `master`); the demo picks
it up at the next release's rebuild. The change directory and the fix land in the same merge (see
the proposal's Sequencing). Rollback is a revert.
