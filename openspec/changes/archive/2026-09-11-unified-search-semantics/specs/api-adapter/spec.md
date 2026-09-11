## MODIFIED Requirements

### Requirement: StaticAdapter for demo
The demo version SHALL use a `StaticAdapter` that reads all data from a pre-embedded JSON object (`window.__DEMO_DATA__`) and implements the `ApiAdapter` interface. The `DemoData` structure SHALL include a `specVersions` field mapping topic to slug to content.

`StaticAdapter.search()` SHALL obtain its results from the shared rule stated by the `search-semantics` capability, over documents built from the embedded records. It SHALL NOT implement a match test, an ordering, or a snippet rule of its own — the static build is a surface of spek, not a second search engine.

#### Scenario: Serve pre-embedded data
- **WHEN** any API method is called (getOverview, getSpecs, getSpec, getChanges, getChange)
- **THEN** it returns the corresponding data from the embedded JSON via `Promise.resolve()`

#### Scenario: Client-side search
- **WHEN** `search(query)` is called
- **THEN** it returns the results the shared search rule produces for the embedded content, identical in set and order to what a host reading the same repository from disk returns

#### Scenario: Search matches spec topic names
- **WHEN** `search("dashboard")` is called and a spec with topic `dashboard-view` exists
- **THEN** the result includes `dashboard-view` as a match

#### Scenario: Search finds task text
- **WHEN** a term appears only in the text of a task in a change's `tasks.md`
- **THEN** `search()` returns that change, because the embedded tasks artifact carries the file's text alongside its parsed structure

#### Scenario: Change results are titled, not shown as raw slugs
- **WHEN** a result is returned for the change `2026-09-10-unified-search-semantics`
- **THEN** its title is `unified search semantics`, matching what every other surface shows

#### Scenario: No-op for inapplicable methods
- **WHEN** `browse()`, `detect()`, or `resync()` is called
- **THEN** it returns sensible defaults without error (empty browse, `hasOpenSpec: true`, void)

#### Scenario: StaticAdapter getSpecAtChange
- **WHEN** `StaticAdapter.getSpecAtChange("user-auth", "2026-01-15-add-oauth")` is called
- **THEN** it reads from `window.__DEMO_DATA__.specVersions["user-auth"]["2026-01-15-add-oauth"]` and returns `{ content: "..." }`

#### Scenario: StaticAdapter getSpecAtChange not found
- **WHEN** `StaticAdapter.getSpecAtChange("user-auth", "nonexistent")` is called
- **AND** no matching version exists in the embedded data
- **THEN** it rejects with an error
