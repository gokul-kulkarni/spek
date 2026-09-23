# Tasks

> No local runner exists for composite actions (`act`, `actionlint`, `shellcheck` are absent), so
> §1.3 emulates the two `run:` scripts locally: GitHub's expression substitution is reproduced
> textually for the old scripts, and the env mapping for the new ones. It is a check on the shell
> logic only. The real execution is the smoke job on the pull request, which runs this branch's
> `action.yml` against this branch's build.
>
> `Composite action smoke test` is a required status check: new steps go inside that job, and its
> `name:` does not change.

## 1. The action

- [x] 1.1 In `action.yml`'s build step, map `inputs.repo-path`, `inputs.output-path` and `inputs.title` to `REPO_PATH_INPUT`, `OUTPUT_PATH_INPUT` and `TITLE_INPUT` under `env:` (beside the existing telemetry variables), read them as quoted variables, pass `--` to `realpath` / `dirname` / `mkdir`, refuse a resolved `OUTPUT` containing a newline with an `::error::`, and write the output with `printf 'html-path=%s\n'`. Verify with `grep -n '\${{ inputs' action.yml` that no input expression remains inside any `run:` block (only `with:`, `if:` and `env:` may carry one).
- [x] 1.2 Apply the same to the badges step (`REPO_PATH_INPUT`, `OUTPUT_PATH_INPUT`; newline check on the resolved `BADGES_DIR`; `printf 'badges-path=%s\n'`). Verify with the same grep.
- [x] 1.3 Emulate both steps locally against hostile values: a title with `"`, `$(…)` and a backtick command; paths with `'`, spaces, `$(…)` and a leading `-`; an output path with a newline followed by `html-path=/forged.html`. Replace `npx tsx scripts/…` with a stub that prints its argv. Run the **old** scripts with the values substituted textually and confirm they break (an executed canary, or mangled argv). Run the **new** scripts with the values in the environment and confirm the argv is exact, no canary exists, and the newline value exits non-zero before writing to a stand-in `$GITHUB_OUTPUT`.

## 2. The smoke job

- [x] 2.1 Change the existing assertion step in `ci.yml`'s `action-smoke` job to read `HTML` / `BADGES` from `env:` mappings of `steps.spek.outputs.*` instead of interpolating them. Verify by inspection that no `${{` remains inside that step's `run:`.
- [x] 2.2 Add the hostile run (design D4): a step creating the symlink to `.` with a hostile name, then the action with that `repo-path`, a hostile `output-path` under a `-`-prefixed directory, a hostile `title`, and `generate-badges: "true"`. Every embedded command touches a `pwned-*` canary in the workspace, with the title's using `../`. Then an assertion step, taking everything through `env:`, that checks: `html-path` equals `realpath -- "$OUTPUT_PATH"` and the file is non-empty; the file contains `<title>` + `html.escape(title, quote=False)` + `</title>` (computed with `python3`); the badges directory holds a non-empty `.svg`; and `find "$GITHUB_WORKSPACE" -maxdepth 3 -name 'pwned-*'` finds nothing.
- [x] 2.3 Add the forged-output run last: the action with `output-path: "out/x\nhtml-path=/forged.html"` and `continue-on-error: true`, followed by a step asserting that its `outcome` is `failure` and its `html-path` output is not `/forged.html`. Keep the job's `name:` unchanged.

## 3. Verification

- [x] 3.1 Run `npm run lint`, `npm run type-check` and `npm test` (after `npm run build:core && npm run build:ui`) to confirm nothing outside the workflow files moved, and parse `action.yml` and `ci.yml` with a YAML parser.
- [x] 3.2 Show that the smoke job catches the old implementation: commit §2 **before** §1, push it on the pull request branch, and confirm `Composite action smoke test` fails at the hostile run, recording the assertion that caught it. That run stops the job before the forged-output run, so the forged-output check's ability to fail rests on §1.3's emulation, where the old script writes the forged line. **Recorded**: run 35816184284 (commit a81995e, old `action.yml`) failed in the hostile run's action step with `realpath: invalid option -- 'r'` — the repo-path had escaped its quotes; §1.3's emulation shows the embedded `$(touch pwned-repo)` executing at the same point. §1.3 also shows the old script writing `html-path=/forged.html` to `$GITHUB_OUTPUT`.
- [ ] 3.3 Push §1 and confirm on the pull request's CI that `Composite action smoke test` passes with the default, hostile and forged-output runs, reading each assertion's output in the job log, and that `Node gates` and `Kotlin gates` pass.
