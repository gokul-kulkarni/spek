## ADDED Requirements

### Requirement: Search rule utility

The core module SHALL own the search rule the `search-semantics` capability states — the document shape,
the match test, the result selection, the ordering, the snippet, and the change-title rule — and SHALL
expose it from a browser-safe module, so that a host reading a repository from disk and a bundle serving a
pre-embedded payload run the same code rather than two agreeing descriptions of it.

Producing the documents is necessarily two functions, because the two inputs differ: one walks a
repository's `openspec/` directory and reads files, the other builds documents from already-loaded change
records. Both SHALL yield the same documents for the same change. Only the file-reading one may load Node
built-ins; the rest of the rule SHALL be reachable without them — see the subpath scenarios under
"Published to the public npm registry".

The rule that renders a change slug as a human-readable title SHALL live beside the search rule rather
than in the scanner, so that a consumer without a filesystem can reach it.

#### Scenario: Matching runs without a filesystem

- **WHEN** a browser bundle imports the search rule and calls it with documents it built from an embedded payload
- **THEN** it returns results, having loaded no Node built-in

#### Scenario: Both document producers agree

- **WHEN** a change's documents are produced from its directory and from its change record
- **THEN** the two lists are equal in count, order, filename and text

#### Scenario: Hosts do not restate the rule

- **WHEN** the web server, the VS Code host and the static adapter answer a search
- **THEN** each obtains its results from this module, holding no match test, ordering or snippet rule of its own

## MODIFIED Requirements

### Requirement: Published to the public npm registry
The core package SHALL be published to the public npm registry under the name `@spekjs/core`, so that repositories outside this monorepo can install and import it. The published tarball SHALL contain the compiled `dist/` output together with its type declarations, and SHALL NOT contain source files.

#### Scenario: Install from a repository outside this monorepo
- **WHEN** a repository that is not a workspace member of this monorepo runs `npm install @spekjs/core`
- **THEN** the package resolves from the npm registry, and `import { scanOpenSpec } from '@spekjs/core'` succeeds without referencing any local path

#### Scenario: Published tarball contents
- **WHEN** the package tarball is inspected before publishing
- **THEN** it contains `dist/` with both `.js` and `.d.ts` files, plus `package.json`, `README.md`, `LICENSE` and `CHANGELOG.md`, and it does not contain `src/`

#### Scenario: Runtime dependencies limited to what core actually imports
- **WHEN** the published package's `dependencies` are inspected
- **THEN** they list only the packages that core actually imports, so that consumers are never forced to install dependencies core does not use

#### Scenario: Subpath exports resolve for external consumers
- **WHEN** an external consumer imports `@spekjs/core/headings`, `@spekjs/core/artifact-order`, `@spekjs/core/graph-node-id`, `@spekjs/core/schema-flow`, `@spekjs/core/cli-budget` or `@spekjs/core/search`
- **THEN** each subpath resolves to its compiled module and type declarations

#### Scenario: Node-free subpaths carry no Node dependency
- **WHEN** a consumer imports one of those subpaths from a browser bundle or from a process that must not load `node:fs`
- **THEN** the import succeeds, because each of those modules is pure logic with no runtime import of a Node built-in or of the package's server-side modules
