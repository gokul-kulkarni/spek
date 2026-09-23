## ADDED Requirements

### Requirement: Embedded content cannot change the structure of the page

The build SHALL write every value it embeds — the OpenSpec payload, the page title, and the
application's script and stylesheet — so that the generated document parses into exactly the
elements the build assembled, in the order it assembled them, each holding the text it was given
(with line endings normalised as the HTML parser normalises them). What an artifact or a title says
SHALL NOT decide where an element ends.

The payload and the title come from content the build does not control: any repository's OpenSpec
text, and a title passed on the command line or as the GitHub Action's `title` input. They SHALL be
encoded so that no spelling of them is read as markup; the data the viewer receives and the text of
the page's `<title>` element SHALL be identical to the originals.

The application's script and stylesheet are the project's own build output, and cannot be
re-encoded without changing what they mean. The build SHALL parse the assembled document before
writing it. If the parsed document does not contain exactly the assembled elements with their text,
the build SHALL fail with a non-zero exit, name the first part in document order whose element
diverges — the title, the payload, the script or the stylesheet — and not write the output file. A
document whose embedded parts do not parse back as written SHALL NOT be produced by a build that
reports success.

The check SHALL follow how an HTML parser reads the document rather than reject a list of character
sequences. Sequences such as `<!--` and `<script` are inert in most positions, and a check that
rejected them outright would reject valid application bundles.

**Rationale**: an artifact documenting how to embed JSON-LD contained `</script>`; the build reported
success and the page rendered its payload as plain text (#54). The build is what the GitHub Action
runs, so every consumer whose content mentions that sequence published a broken snapshot with
nothing in CI to say so.

#### Scenario: Artifact text contains a closing script tag

- **WHEN** a spec or change artifact contains `</script>`, in any letter case
- **THEN** the generated page boots
- **AND** the viewer receives that artifact's text unchanged

#### Scenario: Artifact text opens a comment and then a script tag

- **WHEN** an artifact contains `<!--` followed later by `<script>`, with no `-->` between them
- **THEN** the generated page boots
- **AND** the viewer receives that artifact's text unchanged

#### Scenario: Title contains markup

- **WHEN** the build is given a title containing `</title>`, `<b>` or `&amp;`
- **THEN** the text of the page's `<title>` element is exactly the title given
- **AND** the document contains no element the build did not assemble

#### Scenario: Application bundle would not parse back as written

- **WHEN** the application's script contains an unescaped `</script>`, or `<!--` followed by
  `<script>` with no `-->` between them, or the stylesheet contains `</style>`
- **THEN** the build fails with a non-zero exit, naming the script or the stylesheet
- **AND** the output file is not written

#### Scenario: The failure names the part that caused it

- **WHEN** the stylesheet contains `</style>` followed by a `<script>` element
- **THEN** the build names the stylesheet, not the script element that sequence produced

#### Scenario: Application bundle contains inert sequences

- **WHEN** the application's script contains `<script>` before any `<!--`, or `<!--`, then `-->`,
  then `<script>`
- **THEN** the build succeeds
