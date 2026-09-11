## MODIFIED Requirements

### Requirement: Artifact kind classification
Each discovered artifact SHALL be assigned a `kind` that governs how it is parsed and rendered. A `tasks.md` file SHALL be classified as kind `tasks` and parsed into structured task data (sections + checkboxes) as today, and SHALL **also** carry the file's raw Markdown content. The `specs/` delta tree SHALL be classified as kind `specs` and carry the list of `{ topic, content }` delta files. All other `*.md` files SHALL be classified as kind `markdown` and carry raw Markdown content.

The tasks artifact carries its raw content because a consumer holding only the parsed structure holds less than the file says: the parser keeps section titles and task text and drops everything else, including the column-0 block constructs that end a task. A surface that searches the parsed structure and a surface that searches the file therefore answer differently, and the text the first one cannot find is prose the file plainly contains.

#### Scenario: tasks.md classified as tasks kind
- **WHEN** a change contains `tasks.md`
- **THEN** its artifact has `kind: "tasks"`, exposes parsed `{ total, completed, sections }` task data, and exposes the file's raw content

#### Scenario: specs tree classified as specs kind
- **WHEN** a change contains `specs/<topic>/spec.md` delta files
- **THEN** a single artifact with `kind: "specs"` exposes the list of `{ topic, content }` entries

#### Scenario: Other markdown classified as markdown kind
- **WHEN** a change contains `brainstorm.md`
- **THEN** its artifact has `kind: "markdown"` and exposes the raw file content

### Requirement: Generic ChangeDetail artifacts contract
`ChangeDetail` SHALL expose an ordered `artifacts` array, where each entry carries at minimum an `id`, `title`, `kind`, the name of the root file it was discovered from, and the data appropriate to its kind (`content` for markdown, parsed task data plus `content` for tasks, `specs` for the delta list). The `specs` artifact has no single root file and SHALL carry no file name. The API responses and every `ApiAdapter` implementation (`FetchAdapter`, `MessageAdapter`, `StaticAdapter`) SHALL carry this artifacts array so the frontend renders changes without referring to fixed artifact field names.

The file name is carried because it is the one key a consumer can order and identify artifacts by without a filesystem: display titles are humanized and a data artifact's title is its bare filename, so two consumers sorting by title agree only by coincidence.

#### Scenario: ChangeDetail exposes ordered artifacts
- **WHEN** a change detail is requested
- **THEN** the response includes an ordered `artifacts` array with `id`, `title`, `kind`, the source file name, and kind-appropriate data for each artifact

#### Scenario: Adapters preserve the artifacts array
- **WHEN** a change detail is delivered through any `ApiAdapter` (fetch, message, or static)
- **THEN** the consumer receives the same ordered `artifacts` array

#### Scenario: The specs artifact carries no file name
- **WHEN** a change's `specs` delta artifact is inspected
- **THEN** it carries its `{ topic, content }` list and no source file name

### Requirement: Surface parity for custom-schema artifacts
The web app, the VS Code extension, and the IntelliJ plugin SHALL all render the full set of discovered artifacts for a change using the shared discovery and enrichment rules, and full-text search SHALL index every discovered root artifact — markdown, tasks, and data alike — rather than only `proposal.md`, `design.md`, and `tasks.md`. What search does with those artifacts is stated by the `search-semantics` capability.

#### Scenario: VS Code renders all artifacts
- **WHEN** a change with custom-schema artifacts is opened in the VS Code webview
- **THEN** all discovered artifacts are shown, matching what the web app shows for the same change

#### Scenario: IntelliJ renders all artifacts
- **WHEN** a change with custom-schema artifacts is opened in the IntelliJ tool window
- **THEN** all discovered artifacts are shown, matching what the web app shows for the same change

#### Scenario: Search indexes all markdown artifacts
- **WHEN** full-text search runs over a change that includes `brainstorm.md` and `plan.md`
- **THEN** content from `brainstorm.md` and `plan.md` is searchable, not only `proposal.md`/`design.md`/`tasks.md`
