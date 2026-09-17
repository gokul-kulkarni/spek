## MODIFIED Requirements

### Requirement: BDD keyword highlighting
The system SHALL visually highlight BDD keywords in rendered Markdown content to improve readability of spec documents.

Highlighting SHALL NOT reduce the font weight already applied by the surrounding markup.

Every delta operation OpenSpec defines SHALL be marked, not a subset of them. A marked vocabulary with
gaps in it is read as meaning that the unmarked words are ordinary prose, which is the opposite of what
an unhandled operation is.

Colour SHALL distinguish meanings rather than repeat them: an operation SHALL NOT be given the colour
already carrying normative force, so that a reader who has learned one mark does not have to unlearn it.

**Which spellings are recognised SHALL be decided per keyword group, because the groups do not
carry the same obligation.** A BDD step keyword has no authoritative spelling at all: a scenario body
is free text that no version of OpenSpec parses, so uppercase `WHEN` / `THEN` is a template
convention. `SHALL` / `MUST` does have one: OpenSpec matches it case-sensitively, and a requirement
containing no uppercase `SHALL` or `MUST` is reported against, citing RFC 2119. A single casing rule
across every keyword therefore states something false about one group or the other.

Accordingly:

- An **uppercase** keyword SHALL be highlighted wherever it appears outside a heading, in any
  position and with no emphasis required, as the predominant spelling and the one OpenSpec's own
  templates use.
- A **title-case** step keyword (`When`, `Given`, `Then`, `And`) SHALL be highlighted **only where
  the author's own markup sets the word apart**: inside a bold run whose entire text is that keyword.
  Recognising it by position instead — the first word of a paragraph or list item — would mark the
  ordinary requirement prose that begins "When the server receives…", which is far more common than
  the spelling this admits and appears in documents that have no BDD steps at all.
- `MUST` and `SHALL` SHALL be highlighted in their uppercase spelling only, in any position, and
  SHALL NOT be recognised in title case even under emphasis. Red marks normative force in this
  renderer; lowercase "must" is an ordinary English verb carrying none, so marking it would assert
  something the document does not say.
- The **delta operations** (`ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`) SHALL be highlighted in their
  uppercase spelling only. `Added`, `Modified`, `Removed` and `Renamed` are ordinary words that
  documents use as their own labels — `**Modified**: <file>` heads an impact list in three of this
  repository's own proposals — so admitting them would badge a word that names no delta operation.
  That the bold run is the whole word does not help here: these labels are written exactly that way.
- No spelling below title case SHALL be recognised for any keyword.

**Emphasis is read as setting a word apart, and that is all it can be read as.** It does not
distinguish a step label from a bold mention of the keyword in prose about BDD, and no markup does.
The rule is worth having because a bold run containing nothing but a step keyword is, in practice,
a step; it SHALL NOT be described as recognising authorial intent, which would claim a precision the
mechanism does not have.

**A keyword SHALL NOT be highlighted inside a heading**, in any spelling. This preserves behaviour
readers already rely on for the uppercase spelling — an unemphasised `## ADDED Requirements` has
never been marked — and extends it to the emphasised form rather than letting the relaxation reach a
place the rule was never reasoned about. It is stated because it is **not** what the renderer does
today: `processChildren` runs on `p`, `li` and `strong`, and `strong` is an inline element that
occurs inside headings too, so `## **ADDED** Requirements` is marked today while the far commoner
unemphasised form is not. A heading is a structural separator; badging the word that names the
section restates the heading rather than marking anything in it.

The rendered keyword SHALL be the text the document contains. A title-case keyword SHALL NOT be
displayed re-cased to uppercase: spek shows what a file says, and silently rewriting a word to match
the vocabulary it was matched against misreports the document to the reader who is trying to read it.

The rule SHALL state, as part of the contract rather than as a discovered limit, that a step keyword
written without emphasis is not highlighted. An author who wants the mark can add the emphasis, which
is what the overwhelming majority of specs already do; a reader who finds an unmarked step is being
told the truth about what the markup says rather than shown a guess.

#### Scenario: WHEN/GIVEN keyword highlighting
- **WHEN** rendered Markdown contains the word `WHEN` or `GIVEN` as a standalone uppercase keyword
- **THEN** the keyword is displayed with a blue background label style (blue text on blue-tinted background)

#### Scenario: THEN keyword highlighting
- **WHEN** rendered Markdown contains the word `THEN` as a standalone uppercase keyword
- **THEN** the keyword is displayed with a green background label style (green text on green-tinted background)

#### Scenario: AND keyword highlighting
- **WHEN** rendered Markdown contains the word `AND` as a standalone uppercase keyword
- **THEN** the keyword is displayed with a gray background label style (gray text on gray-tinted background)

#### Scenario: MUST/SHALL keyword highlighting
- **WHEN** rendered Markdown contains `MUST` or `SHALL` as standalone uppercase keywords
- **THEN** the keywords are displayed in red bold text

#### Scenario: Delta operation badge rendering
- **WHEN** rendered Markdown contains `ADDED`, `MODIFIED`, `REMOVED` or `RENAMED` as standalone uppercase keywords
- **THEN** `ADDED` is displayed as an orange badge and `MODIFIED` is displayed as a blue badge, as before
- **AND** `REMOVED` and `RENAMED` are each displayed as a badge in a colour distinct from those two and from each other

#### Scenario: No operation takes the normative colour
- **WHEN** the delta operation badges are compared with the `MUST`/`SHALL` styling
- **THEN** no operation badge uses the colour that marks normative keywords

#### Scenario: Highlighting does not weaken author emphasis
- **WHEN** a BDD keyword appears inside Markdown emphasis, such as `**SHALL**`
- **THEN** the rendered keyword is no lighter in weight than the emphasis the author applied

#### Scenario: Keywords inside code blocks are not highlighted
- **WHEN** BDD keywords appear inside inline code or fenced code blocks
- **THEN** the keywords are NOT highlighted and remain as plain code text

#### Scenario: A title-case step keyword under emphasis is highlighted
- **WHEN** rendered Markdown contains a bold run whose entire text is `Given`, `When`, `Then` or `And`
- **THEN** the keyword is highlighted in the same style as its uppercase spelling

#### Scenario: A title-case delta operation is not highlighted
- **WHEN** rendered Markdown contains a bold run whose entire text is `Added`, `Modified`, `Removed` or `Renamed`, such as the `**Modified**:` that heads an impact list
- **THEN** the word is NOT highlighted, the delta operations being recognised in their uppercase spelling only

#### Scenario: A title-case keyword without emphasis is not highlighted
- **WHEN** rendered Markdown contains `Given a project is registered` as the text of a list item, with no emphasis on the keyword
- **THEN** `Given` is NOT highlighted

#### Scenario: Ordinary prose opening with a keyword is not highlighted
- **WHEN** a requirement's text begins `When the server receives a request, it SHALL respond within 200ms`
- **THEN** `When` is NOT highlighted
- **AND** `SHALL` is highlighted, because its uppercase spelling is recognised in any position

#### Scenario: A keyword inside a longer bold run is not highlighted
- **WHEN** rendered Markdown contains the bold run `Given the user is logged in`, emphasised as a whole
- **THEN** `Given` is NOT highlighted, being a word inside an emphasised clause rather than a label

#### Scenario: A title-case normative keyword is not highlighted
- **WHEN** rendered Markdown contains a bold run whose entire text is `Shall` or `Must`
- **THEN** the word is NOT highlighted

#### Scenario: Case-sensitive matching
- **WHEN** rendered Markdown contains a bold run whose entire text is `when`, `then`, `added` or `shall`
- **THEN** the word is NOT highlighted, no spelling below title case being recognised for any keyword
- **AND** casing remains significant throughout: a title-case keyword is recognised only under emphasis, and `MUST` / `SHALL` only in uppercase

#### Scenario: A highlighted keyword keeps the casing the document used
- **WHEN** a title-case keyword such as `Given` is highlighted
- **THEN** the text displayed is `Given`, not `GIVEN`

#### Scenario: A keyword in a heading is not highlighted
- **WHEN** a heading reads `## **ADDED** Requirements` or `### **Given** the user is known`
- **THEN** no keyword in it is highlighted, at any heading level and in any spelling
- **AND** the heading's own styling, id and folding behaviour are unchanged
