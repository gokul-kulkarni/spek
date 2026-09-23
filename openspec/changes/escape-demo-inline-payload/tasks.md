# Tasks

> §1 runs entirely against the **unchanged** script: it proves the scratch repositories exhibit #54
> and records the baseline §3.1 compares against. Neither can be produced once `build-demo.ts` changes.
>
> This repository's own working tree cannot serve as the baseline: this change's artifacts contain
> `</script>` and `<!--` followed by `<script>`, so the unchanged script builds a broken page from it.
> The baseline is built from `master`'s committed `openspec/`, which contains neither, frozen into a
> scratch directory so that ticking these boxes (which changes this file's content and mtime) cannot
> move the payload between the two builds.
>
> Test inputs spell `<script>` with its `>` — `<!--` then `<script(` does not trip the parser, so a
> test written that way passes against a broken implementation (design D4).
>
> Checking whether a page booted needs a method that sees the DOM after scripts run:
> `google-chrome --headless=new --virtual-time-budget=5000 --dump-dom` and inspect `#root`, or
> evaluate in agent-browser. A plain `--dump-dom` cannot read `window.__DEMO_DATA__`.
>
> `docs/demo.html` is release-time: rebuild it to verify if useful, then revert it. Nothing in this
> change commits it. The change directory and the fix land in the same merge (proposal, Sequencing).

## 1. Baseline and setup

- [x] 1.1 Create three scratch OpenSpec repositories outside the repo, one case each, so no case can mask another: (a) a spec containing `</script>`; (b) a spec containing `<!--` followed later by `<script>`, with no `-->` anywhere after it in any artifact; (c) a change whose `tasks.md` contains `</SCRIPT >`. After `npm run build:core && npm run build:ui`, build each with the unchanged script (`NODE_ENV=production npx tsx scripts/build-demo.ts --repo-dir <case> --output <scratch-out>/<case>-before.html`) and confirm each page fails to boot (`#root` empty). Keep the repositories for §3.2.
- [x] 1.2 Freeze a baseline: `git archive master openspec | tar -x -C <scratch>/frozen`, confirm it contains no `</script` or `<script` (case-insensitive), then build it with the unchanged script and `NODE_ENV=production` to `<scratch-out>/baseline.html` and confirm that page boots. Keep both for §3.1.
- [x] 1.3 Add `parse5` as a root devDependency at the version already in the lockfile (`^7.3.0`). Verify `npm ls parse5` lists it as a direct dependency of the root, and that the `package-lock.json` diff adds or changes no `node_modules/*` entry. The diff will also sync the stale workspace versions recorded for `packages/core` (1.12.0 → 1.13.0) and `packages/vscode` (1.16.0 → 1.18.0); those two are expected.

## 2. The assembly module

- [x] 2.1 Create `scripts/demo-html.ts` with the payload serialiser (design D1) and `scripts/demo-html.test.ts` using `node:test`. Verify with tests that a payload carrying `</script>`, `</SCRIPT >`, and `<!--` then `<script>` — in values and in a key — embeds as one data script whose parsed text is exactly what was emitted, and that evaluating that text in a fresh `vm` context assigns a value deep-equal to the original. Confirm the structure assertions fail against plain `JSON.stringify`.
- [x] 2.2 Add the title escaper (design D2). Verify with tests that titles `</title><b>x</b>`, `R&amp;D` and the default `spek — OpenSpec Viewer Demo` read back exactly as given from the parsed document's `<title>` text, and that no `<b>` element appears in the parsed document.
- [x] 2.3 Add the verifier (design D3), exported on its own: given a document and the intended title, payload, script and optional stylesheet, it parses the document and reports the **first** part, in document order, whose element is missing, extra or holds different text (the intended text's CRLF and lone CR normalised to LF first), and says, when that part is the payload or the title, that the escaping is at fault. Verify with tests that: the three raw #54 documents (payload embedded with plain `JSON.stringify`) fail naming the payload; a stylesheet of `</style><script>x</script>` fails naming the stylesheet, not the script it produced; a script holding a raw U+0000 fails naming the script; a script holding CRLF passes.
- [x] 2.4 Add `assembleDemoHtml`, taking the title, payload, script and optional stylesheet, building the document with the serialiser and escaper, and returning it only if the verifier passes — throwing its error otherwise. Keep the markup otherwise identical to what `build-demo.ts` emits today (`lang`, meta tags, font links, element order). Verify with tests that: a script containing an unescaped `</script>` throws naming the script; a script containing `<!--` then `<script>` with no `-->` between throws naming the script; scripts containing `<script>` before any `<!--`, or `<!--`, `-->`, then `<script>`, or `<!--` then `<script(` are accepted; a stylesheet containing `</style>` throws naming the stylesheet; a document with no stylesheet emits no `<style>`.
- [x] 2.5 Add `node --import tsx --test "scripts/*.test.ts"` to the root `npm test` script, after the three workspace runs, and update `CONTRIBUTING.md:52`'s description of `npm test` (currently "core + ui + web") to match. Verify `npm test` runs the new suite, and that deliberately breaking one assertion makes `npm test` exit non-zero. Confirm `npm run type-check` and `npm run lint` cover the new files with no config change (`tsconfig.scripts.json` includes `scripts/`; the lint glob names it).

## 3. Wiring the build

- [x] 3.1 Replace the inline template and `JSON.stringify` in `scripts/build-demo.ts` with a call to `assembleDemoHtml`, writing the output file only with the value it returns, and move the removal of `packages/web/dist-demo/` into a `finally` so a failed check leaves nothing untracked. Verify by rebuilding §1.2's frozen directory with `NODE_ENV=production` and comparing with `baseline.html`, splitting each at the known delimiters `<script>window.__DEMO_DATA__ = ` and the following `;</script>`: the bytes outside the payload are identical, and the two payloads evaluate (in a fresh `vm` context) to deep-equal values.
- [x] 3.2 Rebuild each §1.1 scratch repository with `--title '</title><b>R&amp;D'` and confirm that each page boots, that `window.__DEMO_DATA__` holds the artifact's text unchanged, and that the `<title>` element's text is `</title><b>R&amp;D` exactly.
- [x] 3.3 Exercise the failure path end to end: temporarily add `console.debug("<!-- <script>")` immediately before the `createRoot(` call in `packages/web/src/main.demo.tsx` (the minifier escapes only `</script`, and keeps this string intact where it sits), run `build-demo.ts` to a scratch output path, and confirm a non-zero exit, an error naming the script, no file at that path, and no `packages/web/dist-demo/`. If the build instead succeeds, the sequence did not reach the bundle: run the demo Vite build on its own and grep `dist-demo/assets/*.js` to find out why, rather than leaving this path to the unit tests — §2 tests a pure function and cannot see the exit code or the file. Revert the edit and confirm `git status` shows nothing from it.
- [x] 3.4 Verify the action by hand, as CLAUDE.md requires for changes to the generated HTML's content or to input handling: on the pull request branch, add a temporary workflow that runs `uses: ./` with `spek-version: ${{ github.sha }}` and `title: '</title><b>R&amp;D'`, and asserts that the output's `<title>` line reads `<title>&lt;/title&gt;&lt;b&gt;R&amp;amp;D</title>` and that the file holds exactly two `</script>` (case-insensitive). The branch's own payload carries this change's artifacts, so the same run exercises the payload escape on real content. Confirm the run is green, then delete the workflow before merge.

## 4. Gates

- [x] 4.1 Run `npm run build:core && npm run build:ui && npm run type-check && npm run lint && npm test` and confirm all pass. Building ui as well as core is required — a clean tree without it fails `type-check` with TS2307.
- [x] 4.2 Run `NODE_ENV=production npm run build:demo` from the working tree — whose payload now includes this change's own artifacts — and confirm the build succeeds and the page boots. Then restore `docs/demo.html` with `git checkout -- docs/demo.html` and confirm `git status` shows no change under `docs/`.
