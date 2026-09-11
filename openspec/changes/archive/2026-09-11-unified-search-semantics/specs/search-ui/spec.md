## MODIFIED Requirements

### Requirement: Search query execution
The system SHALL search across all specs and changes content by calling the backend search API with debounced input. Search results SHALL highlight matching text fragments in the title and context preview. Because a result may be returned on a name match with no occurrence in its text — where highlighting has nothing to mark — a result SHALL also show the artifact file it came from, and SHALL mark a result belonging to an archived change as archived. A reader SHALL be able to tell from the row why it is there and what it points at, without opening it. A result SHALL be identified by its slug or topic rather than by its displayed title: two changes may share a description and differ only by date.

#### Scenario: Debounced search on input
- **WHEN** user types a query in the search input
- **THEN** the system waits 300ms after the last keystroke before sending the search request

#### Scenario: Display search results with highlights
- **WHEN** the search API returns results
- **THEN** results are displayed grouped by type (Specs and Changes), with matching query text highlighted using a contrasting background color in both the title and context snippet

#### Scenario: No results found
- **WHEN** the search API returns an empty array
- **THEN** the dialog displays a "No results found" message with a suggestion to try different keywords

#### Scenario: Empty query
- **WHEN** the search input is empty
- **THEN** no search request is made and the results area shows a prompt to start typing

#### Scenario: A result with no highlightable match is still explained
- **WHEN** a result is returned because the query matched a change's name and not its text
- **THEN** the row shows the artifact file the snippet came from, so the reader can see what they are being offered

#### Scenario: An archived result is marked
- **WHEN** a result belongs to an archived change
- **THEN** the row marks it as archived, distinguishing it from an active change

#### Scenario: Two changes sharing a description do not collide
- **WHEN** two changes archived on different dates share the same description
- **THEN** both are listed, each identified by its own slug
