## ADDED Requirements

### Requirement: Input values reach the build as data, never as shell source

The action SHALL pass every input value to its shell steps as data, so that no spelling of a value —
quotes, `$(…)`, backticks, `;`, whitespace, a leading `-` — is interpreted by the shell or taken as
an option by the tools the value is handed to. A value SHALL arrive where the action uses it exactly
as the workflow wrote it, after GitHub's own expression expansion.

The action SHALL NOT write a value to `$GITHUB_OUTPUT` that could add a line to it. When the path it
would report as an output contains a newline, the action SHALL fail with an error naming the problem
instead of writing it.

**Rationale**: the action interpolated `repo-path`, `output-path` and `title` into its `run:`
scripts, so GitHub substituted each value into the shell source before the shell ran. A title with a
double quote broke the build's arguments, and a workflow that fed an attacker-influenced value into
an input ran that value's shell syntax in its own job (#56). A newline in a reported path would let
an input forge the action's outputs.

#### Scenario: Title carries shell syntax

- **WHEN** a workflow sets `title` to a value containing double quotes, `$(…)`, a backtick command
  and `&`
- **THEN** the generated page's `<title>` element reads exactly that value
- **AND** no command contained in the value is executed

#### Scenario: Paths carry shell syntax and a leading dash

- **WHEN** a workflow sets `repo-path` and `output-path` to values containing quotes, `$(…)`, spaces,
  or a path segment beginning with `-`
- **THEN** the action scans the directory `repo-path` names and writes the page to the path
  `output-path` names, and the `html-path` output is that path's absolute form
- **AND** no command contained in either value is executed

#### Scenario: An output path that would forge an output is refused

- **WHEN** a workflow sets `output-path` to a value containing a newline followed by
  `html-path=/forged.html`
- **THEN** the action fails with an error
- **AND** the `html-path` output does not report `/forged.html`
