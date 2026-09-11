## Purpose

Provide the search dialog and result presentation over the results the search API returns, in the order it returns them.

## Requirements

### Requirement: Search dialog activation
The system SHALL provide a search dialog that can be opened via keyboard shortcut or UI interaction.

#### Scenario: Open search with keyboard shortcut
- **WHEN** user presses `Cmd+K` (macOS) or `Ctrl+K` (other platforms) anywhere in the application
- **THEN** a search dialog modal opens with focus on the search input field

#### Scenario: Open search via header button
- **WHEN** user clicks the search button in the application header
- **THEN** the search dialog modal opens with focus on the search input field

#### Scenario: Close search with Escape
- **WHEN** the search dialog is open and user presses `Escape`
- **THEN** the search dialog closes

#### Scenario: Close search by clicking backdrop
- **WHEN** the search dialog is open and user clicks outside the dialog
- **THEN** the search dialog closes

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

### Requirement: Search type filter
The system SHALL provide a type filter in the search dialog allowing users to narrow results by category: All, Specs only, or Changes only.

#### Scenario: Filter by type
- **WHEN** user selects "Specs" filter while search results are displayed
- **THEN** only spec-type results are shown, change-type results are hidden

#### Scenario: Default filter
- **WHEN** the search dialog opens
- **THEN** the "All" filter is selected by default, showing both spec and change results

#### Scenario: Filter with no matching results
- **WHEN** user selects a type filter and no results match that type
- **THEN** a "No results found" message is displayed for that category

### Requirement: Search result navigation
The system SHALL allow users to navigate to search results using keyboard or mouse.

#### Scenario: Click to navigate
- **WHEN** user clicks on a search result
- **THEN** the application navigates to the corresponding page (`/specs/:topic` for spec results, `/changes/:slug` for change results) and the search dialog closes

#### Scenario: Keyboard navigation with arrow keys
- **WHEN** user presses the down arrow key in the search dialog
- **THEN** the next result item is highlighted
- **AND** pressing the up arrow key highlights the previous result item

#### Scenario: Confirm selection with Enter
- **WHEN** user presses Enter with a result item highlighted
- **THEN** the application navigates to that result's page and the search dialog closes
