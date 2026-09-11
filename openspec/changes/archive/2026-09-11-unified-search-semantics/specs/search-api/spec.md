## MODIFIED Requirements

### Requirement: Full-text search endpoint
The system SHALL provide `GET /api/openspec/search` that searches across all specs and changes content. The corpus it searches, what counts as a match, which result a match produces, and the order results are returned in SHALL be those stated by the `search-semantics` capability — the endpoint SHALL NOT define search behaviour of its own.

A change's searchable content therefore includes its markdown artifacts, its `tasks.md`, and its `data` artifacts (root-level `.yaml`, `.yml`, and `.json` files). These come from the same source of truth used for discovery and counting, on every host. Any artifact shown as a tab in the change-detail view is therefore also searchable, whichever host renders it.

Results SHALL NOT carry a relevance score, and SHALL NOT be ordered by one.

The 400 SHALL be raised only when the `q` parameter is **absent**. A presence test SHALL be used rather than a falsiness test, which cannot tell an empty value from a missing parameter.

#### Scenario: Search with matching results
- **WHEN** client sends `GET /api/openspec/search?dir=/path/to/repo&q=effectiveCurrent`
- **THEN** system returns a JSON array of results, each with `type` ("spec" or "change"), `title`, the `topic` or `slug` it belongs to, the `file` the match came from, and a `context` snippet
- **AND** results are in the deterministic order `search-semantics` states

#### Scenario: A verbatim term anywhere in a document is found
- **WHEN** a term occurs only near the end of a long spec or proposal
- **THEN** the endpoint returns that spec or change

#### Scenario: One result per change
- **WHEN** the query matches text in three of a change's artifact files
- **THEN** the response contains exactly one result for that change

#### Scenario: Search with no results
- **WHEN** client sends `GET /api/openspec/search?dir=/path/to/repo&q=xyznonexistent`
- **THEN** system returns an empty array

#### Scenario: Search without query parameter
- **WHEN** client sends `GET /api/openspec/search?dir=/path/to/repo` with no `q` parameter at all
- **THEN** system returns HTTP 400 with error message

#### Scenario: Search with an empty or blank query parameter
- **WHEN** client sends `GET /api/openspec/search?dir=/path/to/repo&q=` or `&q=%20`
- **THEN** system returns an empty array — the parameter is present, so the caller searched for nothing rather than forgetting to ask

#### Scenario: Repeated query parameter
- **WHEN** client sends `GET /api/openspec/search?dir=/path/to/repo&q=a&q=b`
- **THEN** system returns HTTP 400 rather than failing on a value that is not a string

#### Scenario: Data artifact content is searchable
- **WHEN** a change contains a `data` artifact (for example `asyncapi.yaml`) whose text matches the query
- **THEN** that change appears in the results, consistent with the artifact being shown as a tab

### Requirement: Search context preview
Each search result SHALL include surrounding context to help users identify the relevant content, by the snippet rule the `search-semantics` capability states.

#### Scenario: Result includes context
- **WHEN** a search matches text within a Markdown file
- **THEN** the match includes up to 100 characters before and after the matched text as context preview
