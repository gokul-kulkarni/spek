## MODIFIED Requirements

### Requirement: Search endpoint
The server SHALL implement `GET /api/spek/openspec/search` with a `q` query parameter that performs full-text search across all spec and change content, by the rule the `search-semantics` capability states. The Kotlin implementation is one of the rule's two implementations and SHALL be held against the shared fixture corpus rather than described separately here. An absent `q` SHALL be rejected rather than defaulted, so that the two HTTP surfaces answer a malformed request the same way.

#### Scenario: Search with results
- **WHEN** `GET /api/spek/openspec/search?projectPath=...&q=dashboard` is called
- **THEN** it returns matching results with type, title, source file, and context snippets, in the order `search-semantics` states

#### Scenario: Results match the other surfaces
- **WHEN** the same query is run against the same repository through this endpoint and through the web server
- **THEN** both return the same results in the same order

#### Scenario: Search without query parameter
- **WHEN** `GET /api/spek/openspec/search?projectPath=...` is called with no `q` parameter
- **THEN** it returns HTTP 400, as the web endpoint does, rather than defaulting the query to an empty string and answering with an empty array

#### Scenario: Search with no results
- **WHEN** `GET /api/spek/openspec/search?projectPath=...&q=xyznonexistent` is called
- **THEN** it returns an empty array
