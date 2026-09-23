## Why

`action.yml` writes `${{ inputs.repo-path }}`, `${{ inputs.output-path }}` and `${{ inputs.title }}`
straight into the `run:` scripts of its build and badge steps (#56). GitHub expands an expression
before the shell sees the script, so an input's value becomes part of the shell *source*, not an
argument. As a result:
- A title such as `My "draft" specs` breaks the quoting, and the build gets mangled arguments.
- Any workflow that feeds an attacker-influenced value into an input (a PR title, a branch name)
  runs that value's shell syntax in the consumer's job. GitHub's hardening guide names this
  pattern script injection.

## What Changes

- Every input reaches the action's shell steps through `env:` and is read as a quoted variable, so
  no spelling of a value is shell syntax. A value starting with `-` is not taken as an option by
  the path utilities either.
- An `output-path` whose resolved path contains a newline is rejected with an error. It would
  otherwise add lines to `$GITHUB_OUTPUT` and let the input forge the action's outputs.
- The CI smoke job runs the action a second time, with inputs that carry quotes, `$(…)`, backticks,
  spaces and a leading `-`. It asserts that each arrived literally and that nothing in them ran.
  The job's existing assertion step reads the action's outputs through `env:` for the same reason:
  it has been interpolating them into its own script.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `github-action`: adds a requirement that input values reach the build as data, never as shell
  source, and that an output path which cannot be written to `$GITHUB_OUTPUT` safely is refused.
- `continuous-integration`: the *composite action is smoke-tested* requirement gains a run with
  shell-hostile inputs, asserting literal arrival and that no embedded command executed.

## Impact

- **Code**: `action.yml` (build and badge steps) and `.github/workflows/ci.yml` (the `action-smoke`
  job, whose name — `Composite action smoke test` — is a required status check and does not change).
  No script, package, or input/output name changes.
- **Consumers**: a consumer runs the `action.yml` at the ref it `uses:`, not the one `spek-version`
  names (that input only picks the build scripts). So this reaches `@master` users on merge and
  `@v1` users when the next release moves the major tag, unlike a fix to the build scripts, which
  reaches both on merge. Existing values behave the same, except values that relied on shell
  expansion (e.g. `output-path: $HOME/x.html`), which now arrive literally. GitHub's own `${{ }}`
  expressions in a consumer's workflow are expanded before the action sees them and are unaffected.
- **Verification**: the smoke job already runs the PR's `action.yml` (`uses: ./`) against the PR's
  build (`spek-version: ${{ github.sha }}`), so the new hostile run *is* the pre-merge
  verification CLAUDE.md asks for, and it stays in CI permanently rather than as a temporary workflow.
- **Release notes**: a product-line fix for the GitHub Action, root CHANGELOG only. It notes the
  behaviour change for shell-expanded values.
