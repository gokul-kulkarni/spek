## MODIFIED Requirements

### Requirement: The composite action is smoke-tested

The workflow SHALL invoke the composite action defined by `action.yml` against this repository, with
badge generation enabled, and SHALL assert that the files named by the `html-path` and `badges-path`
outputs exist and are non-empty.

`action.yml` is the only shipped artifact with no test coverage, and it fails silently: moving
`@spekjs/ui`'s build from `prepare` to `prepublishOnly` removed the action's only source of ui
`dist` and the Marketplace action was broken for a full day with nothing raising an alarm. Asserting
that the outputs merely have values is not sufficient — a step output is set whether or not the
build produced anything.

The same job SHALL also invoke the action with inputs that carry shell syntax — quotes, `$(…)`,
backticks, spaces and a leading `-` in `repo-path`, `output-path` and `title` — each embedding a
command that would leave a detectable trace if executed. It SHALL assert that every value arrived
literally and that no trace exists. It SHALL further invoke the action with an `output-path` that
would forge an output through a newline, and assert that the invocation fails. Each of these checks
SHALL be able to fail against an implementation that interpolates inputs into shell source.

The job SHALL read the action's outputs as data too, not interpolate them into its own scripts.

These invocations SHALL live in the existing smoke job rather than a new one, because that job's name
is a required status check: steps inside it gate a merge, while a new job gates nothing until branch
protection is changed to name it.

#### Scenario: Action produces the HTML

- **WHEN** the smoke job runs the action against this repository
- **THEN** the file at the `html-path` output exists and is non-empty

#### Scenario: Action produces badges

- **WHEN** the smoke job runs the action with `generate-badges: "true"`
- **THEN** the directory at the `badges-path` output exists and contains at least one badge file

#### Scenario: Broken build chain fails the job

- **WHEN** the action's build chain stops producing a workspace package's `dist`
- **THEN** the smoke job fails rather than reporting success with an empty output

#### Scenario: Inputs with shell syntax arrive literally

- **WHEN** the smoke job runs the action with shell-hostile `repo-path`, `output-path` and `title`
- **THEN** `html-path` is the absolute form of the literal `output-path`, the page's `<title>` reads the
  literal title, and badges are produced
- **AND** no command embedded in any input has run

#### Scenario: An input that would forge an output fails the action

- **WHEN** the smoke job runs the action with an `output-path` containing a newline followed by
  `html-path=/forged.html`
- **THEN** that invocation fails, and the job asserts that it did

#### Scenario: Interpolating inputs fails the job

- **WHEN** `action.yml` interpolates an input into a `run:` script, or writes an unchecked path to
  `$GITHUB_OUTPUT`
- **THEN** the smoke job fails
