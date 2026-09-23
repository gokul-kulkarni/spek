## Context

Two `run:` steps in `action.yml` interpolate inputs into shell source:

- **build**: `realpath "${{ inputs.repo-path }}"`, `dirname "${{ inputs.output-path }}"`,
  `realpath "${{ inputs.output-path }}"`, and `--title "${{ inputs.title }}"`. The title arrives
  after `cd .spek-builder`, so anything it runs runs in spek's checkout.
- **badges**: the same `repo-path` and `output-path` forms.

`spek-version` reaches only `actions/checkout`'s `ref:` and `generate-badges` only an `if:`
expression. Neither passes through a shell, so neither is affected.

Both steps then write paths derived from `output-path` to `$GITHUB_OUTPUT` as `name=value` lines. The
runner reads each line as one output, so a newline in the value starts a new `name=value` line —
another output of the attacker's choosing.

`ci.yml`'s smoke job has the same shape one level up: its assertion step reads
`HTML='${{ steps.spek.outputs.html-path }}'`. Harmless for the default path, but a path containing
`'` would break the job's own script.

No local runner is available (`act`, `actionlint` and `shellcheck` are not installed), so the smoke
job, which runs the PR's own `action.yml` against the PR's own build, is the only real execution of
these steps.

## Goals / Non-Goals

**Goals:**

- No input value, however spelled, is shell syntax in any step of the action.
- No input value can add a line to `$GITHUB_OUTPUT`.
- CI proves both on every pull request, including that the check fails the old implementation.

**Non-Goals:**

- `npm-publish.yml` interpolating `needs.check.outputs.*` into `run:`. Those values are versions read
  from the repository's own `package.json` on `master`, so nothing outside the repo controls them.
- Validating what an input *means*, e.g. that `repo-path` holds an `openspec/` directory. The action
  already fails downstream on a wrong path, as it does today.
- Supporting a newline inside an output path. Such a path is refused, not carried faithfully (D3).

## Decisions

### D1. Inputs travel through `env:` under names of their own

Each affected step declares `REPO_PATH_INPUT`, `OUTPUT_PATH_INPUT` and (build only) `TITLE_INPUT`
from `${{ inputs.* }}` in `env:`, and the script reads `"$REPO_PATH_INPUT"` and so on. The runner
places the value in the process environment. The shell expands the variable once, as data, and
performs no further parsing on the result.

The names are deliberately not:

- **`INPUT_*`** — the prefix the runner uses to hand inputs to JavaScript and Docker actions.
  Borrowing it in a composite action invites the belief that the runner sets it, and would compete
  with the runner if it ever did.
- **`SPEK_*`** — that prefix is spek's own runtime configuration (`SPEK_WATCH_POLLING`,
  `SPEK_TASK_CORPUS_DIR`), and the build runs with this environment.

Alternative: quoting inside the expression (e.g. `toJSON(inputs.title)`). JSON quoting is not shell
quoting. `$` and backticks survive inside double quotes, so this only moves the injection.

### D2. Path utilities get `--`

`realpath -- "$X"`, `dirname -- "$X"`, `mkdir -p -- "$X"`. With the value now an argument, a leading
`-` would otherwise be read as an option. `build-demo.ts`'s own argument parser takes the next argv
entry verbatim, so `--title` and `--output` need nothing more.

### D3. A newline in an output path is refused, not encoded

Before either step writes to `$GITHUB_OUTPUT`, it fails with an `::error::` if the value it is about
to write contains a newline. The check applies to the resolved value, not the input: the invariant
is about what gets written, and resolution passes through the filesystem. Writing uses
`printf '%s=%s\n'` rather than `echo`.

Alternative: GitHub's multiline form (`name<<DELIMITER`), which would carry the path faithfully. A
path with a newline is never intended. Every consumer that then reads the output in its own
`run:` would inherit the hazard. And the delimiter must itself be chosen so the value cannot contain
it. Refusing is simpler and closes the case completely.

The title is never written to `$GITHUB_OUTPUT`, and `repo-path` is only read, so neither needs the
check.

### D4. The smoke job gains a hostile run and a forged-output run, inside the existing job

Both run as extra steps in `action-smoke`, not as a new job. The job's name is a required status
check, so steps inside it gate merges automatically, while a new job would gate nothing until
someone added it to branch protection.

- **Hostile run**, after the existing default run:
  - `repo-path` is a symlink to `.` whose name carries quotes, `$(…)`, spaces and a leading `-`.
  - `output-path` puts a file with the same kinds of characters under a directory starting with `-`.
  - `title` carries quotes, `$(…)`, a backtick command, `&` and `<b>`.
  - Each embedded command would `touch` a canary file in the workspace. The title's canary uses
    `../`, because the title is expanded after `cd .spek-builder`.
  - Assertions:
    - `html-path` equals the resolved literal `output-path`, and the file is non-empty;
    - the page's `<title>` line equals the literal title, HTML-escaped (computed on the runner with
      Python's `html.escape(…, quote=False)`, which escapes the same three characters as the build);
    - the badges directory holds at least one badge;
    - no canary exists.
- **Forged-output run**, last, since a failed composite action skips its own cleanup:
  - `output-path` is `out/x` + newline + `html-path=/forged.html`.
  - The step has `continue-on-error: true`, and the job asserts its outcome is `failure`.
  - Without D3 the run succeeds and reports `/forged.html` as its `html-path` (the later line wins), so this assertion fails against
    the old implementation.

The canaries and the forged path give both runs a way to fail against the old `action.yml`, not
just to pass against the new one.

### D5. The smoke job's own assertion step reads outputs through `env:`

`HTML` and `BADGES` come from `env:` mappings of `steps.spek.outputs.*`, and the hostile run's
assertions follow the same shape. Required, not tidiness: the hostile run's paths contain `'`.

## Risks / Trade-offs

- [A consumer relied on shell expansion in an input, e.g. `output-path: $HOME/site.html`] → the value
  now arrives literally, and the file lands at a path with a literal `$HOME` in it. This is the fix
  working as intended, and it is stated in the release notes. `${{ }}` expressions and `env`
  references at the workflow level are unaffected: the runner expands them before the action runs.
- [The smoke job takes longer] → two more action runs, with dependencies served by the action's own
  `actions/cache`. It runs in parallel with the Kotlin gates, which already take longer.
- [`@v1` consumers are unprotected until the next release moves the tag] → inherent to where an
  action definition is resolved. The release that moves `v1` should go out soon after merge.

## Migration Plan

None. Merge reaches `@master` consumers at once and `@v1` consumers at the next release. Rollback is
a revert.
