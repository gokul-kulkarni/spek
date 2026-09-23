## Why

`scripts/build-demo.ts` assembles its single-file page by pasting values into HTML text unescaped.
An artifact containing `</script>` ends the data script early: `window.__DEMO_DATA__` is never
defined, the viewer never boots, and the rest of the JSON renders as page text — while the build
reports success (#54). This is the script the `spekhq/spek` GitHub Action runs, and the action's
`spek-version` defaults to `master`, so every consumer whose OpenSpec content mentions the sequence
(documenting JSON-LD, CSP, HTML templating) publishes a broken snapshot with nothing in CI to say so.

## What Changes

- The payload is serialised so that nothing inside it can change how the HTML parser tokenises the
  page: `<` is written as the JSON escape `\u003c`, which the script evaluates back to `<`, so the
  value the viewer receives is unchanged. This also covers `<!--` followed by `<script>`, whose effect
  the issue does not describe: it does not truncate the data, it makes the data script **swallow the
  application bundle after it**, so the page never boots either.
- The page title is HTML-escaped where it is written into `<title>`, so `--title` (the Action's
  `title` input) is shown as text rather than parsed as markup.
- The inlined JavaScript and CSS bundles are checked before the page is written. A bundle that would
  not parse back as written fails the build, naming the bundle, instead of producing a page that
  cannot boot. Nothing shipped today trips it, although today's bundle contains `<!--`, `-->` and
  `<script` — each in a position the parser does not act on. So the check follows the parser's
  actual rules rather than banning substrings, which would fail the current build.
- The page assembly becomes testable, with regression tests for the payload, title and bundle cases.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `demo-page`: adds a requirement that embedded content — artifact text, the page title, the inlined
  bundles — cannot change the structure of the generated page, and that a bundle which would is a
  build failure rather than a broken page.

`github-action` is not modified: its *Parameterized build script* requirement already says the title
appears in `<title>`, which stays true; how every value, the title included, is written into the
page is the new `demo-page` requirement's concern.

## Impact

- **Code**: `scripts/build-demo.ts` (page assembly) plus tests, a new root devDependency for the
  structural check, and the root `npm test` script gaining the `scripts/` suite — so
  `CONTRIBUTING.md`'s description of `npm test` is updated with it. Details in `design.md`.
- **GitHub Action**: fixed for consumers on merge, not on release, because `spek-version` defaults to
  `master`. No input or output changes and `action.yml` is untouched, but the generated HTML's
  encoding and the `title` input's handling are both outside what the smoke job covers, so the
  action is verified by hand as CLAUDE.md requires (see `tasks.md`).
- **Sequencing**: this change's own artifacts contain `</script>` and `<!--` followed by `<script>`,
  and `docs/demo.html` embeds the active changes. The artifacts must reach `master` together with the
  fix — landed alone, the next release's demo rebuild would publish a page that cannot boot. Once
  merged, they make this repository's own payload a standing regression fixture for every demo build
  and smoke run.
- **`docs/demo.html`**: the rebuild stays release-time and is not committed by this change.
- **Release notes**: a product-line fix, relevant to the demo and the GitHub Action. It belongs in the
  root CHANGELOG only — neither the VS Code nor the IntelliJ host embeds data this way. `@spekjs/core`
  and `@spekjs/ui` are unaffected.
