/**
 * The palette handed to Mermaid, declared as data so it can be measured.
 *
 * Mermaid ships its own colours and writes them into the SVG it generates at view time. That is a
 * mechanism by which colour reaches the screen which `contrast.test.ts` structurally cannot see: the
 * values are properties of a configuration object rather than classes on an element, and the elements
 * they land on do not exist until a reader opens the page. A scan finds nothing to report, which is
 * indistinguishable from finding nothing wrong — the same shape as the SVG-attribute gap that let a
 * whole diagram sit at 1.13:1 while the palette was reported as conforming.
 *
 * So the measurement is made at the **declaration**: this table is the complete set of colours the
 * application hands over, each naming the `--color-*` token it comes from and the floor its use answers
 * to. `contrast.test.ts` imports it and measures every entry in both themes. Adding a key here without a
 * role is a type error; naming a token `global.css` does not define fails a test.
 *
 * Two rules this table exists to keep:
 *
 * - **No literals.** A hex here is an untokenized literal in a place no stylesheet review would look. The
 *   only values are token names, resolved against the document at draw time, so re-authoring a token in
 *   `global.css` re-authors the diagram and re-measures it.
 * - **No silent defaults.** Every base variable that would otherwise take Mermaid's own value is either
 *   in this table or listed in `DECLARED_DEFAULTS` with why it owes nothing. Mermaid's defaults are
 *   chosen against Mermaid's assumed background, not this application's.
 */

/**
 * What a colour in the palette is for, and therefore what floor it answers to.
 *
 * Floors are measured against the worst of the theme's three surfaces, as the rest of the palette check
 * is: there is no map of which diagram lands on which panel, and a node's own fill is `bg-tertiary`,
 * which is one of the three.
 */
export type DiagramColorRole =
  /** Drawn as text — node labels, edge labels, titles. WCAG 1.4.3: 4.5:1. */
  | { kind: "text" }
  /** A line or border that is the sole carrier of its meaning — an edge, a node outline. 1.4.11: 3:1. */
  | { kind: "graphic" }
  /** A fill behind other marks. It owes nothing itself; what is drawn on it is measured against it. */
  | { kind: "surface"; reason: string };

export interface DiagramColor {
  /** The `--color-*` token, without the prefix, exactly as `global.css` spells it. */
  token: string;
  role: DiagramColorRole;
  /** Where this reaches the reader, so a later use the label does not describe reads as undeclared. */
  label: string;
}

const text = (token: string, label: string): DiagramColor => ({ token, role: { kind: "text" }, label });
const graphic = (token: string, label: string): DiagramColor => ({
  token,
  role: { kind: "graphic" },
  label,
});
const surface = (token: string, label: string, reason: string): DiagramColor => ({
  token,
  role: { kind: "surface", reason },
  label,
});

/**
 * Mermaid `themeVariables` key -> the token it takes its value from.
 *
 * The keys are Mermaid's `base` theme variables. `base` specifically: Mermaid's other built-in themes
 * ignore most of these, so a partial override silently leaves the library's own colours in place, which
 * is precisely the failure this table exists to prevent.
 *
 * The per-diagram-type keys (sequence, note, cluster) are here rather than left to Mermaid's derivation
 * because derivation is the same silent default by another route: `base` computes them from
 * `primaryColor` with its own lightening, which is arithmetic performed against an assumed background.
 */
export const DIAGRAM_COLORS: Record<string, DiagramColor> = {
  // --- Surfaces ---
  background: surface("bg-primary", "the page the diagram is drawn on", "a fill; what sits on it is measured against it"),
  mainBkg: surface("bg-tertiary", "flowchart node fill", "a fill; node text is measured against it"),
  primaryColor: surface("bg-tertiary", "primary node fill", "a fill; node text is measured against it"),
  secondaryColor: surface("bg-secondary", "secondary node fill, cluster background", "a fill"),
  tertiaryColor: surface("bg-secondary", "tertiary node fill", "a fill"),
  clusterBkg: surface("bg-secondary", "subgraph background", "a fill"),
  noteBkgColor: surface("bg-secondary", "note fill", "a fill; note text is measured against it"),
  labelBackgroundColor: surface("bg-secondary", "edge label backing", "a fill; the label on it is measured"),
  edgeLabelBackground: surface("bg-secondary", "edge label backing", "a fill; the label on it is measured"),
  actorBkg: surface("bg-tertiary", "sequence actor box fill", "a fill; actor text is measured against it"),
  labelBoxBkgColor: surface("bg-tertiary", "sequence loop label fill", "a fill"),
  activationBkgColor: surface("bg-tertiary", "sequence activation bar fill", "a fill"),

  // --- Text ---
  textColor: text("text-primary", "general diagram text"),
  primaryTextColor: text("text-primary", "text inside a primary node"),
  secondaryTextColor: text("text-primary", "text inside a secondary node"),
  tertiaryTextColor: text("text-primary", "text inside a tertiary node"),
  nodeTextColor: text("text-primary", "flowchart node label"),
  titleColor: text("text-primary", "diagram title"),
  labelColor: text("text-primary", "edge label"),
  actorTextColor: text("text-primary", "sequence actor name"),
  signalTextColor: text("text-primary", "sequence message label"),
  loopTextColor: text("text-primary", "sequence loop label"),
  noteTextColor: text("text-primary", "note body"),
  labelTextColor: text("text-primary", "sequence loop label text"),
  classText: text("text-primary", "class diagram member text"),
  sequenceNumberColor: text("text-primary", "sequence message number"),
  altBackground: surface("bg-secondary", "sequence alt block backing", "a fill"),

  // --- Graphics that carry their own meaning ---
  // An edge is the only thing saying one node leads to another, so it owes 3:1 — the same judgement the
  // schema workflow diagram's edges already carry in NON_TEXT.
  lineColor: graphic("text-secondary", "flowchart edge"),
  signalColor: graphic("text-secondary", "sequence message arrow"),
  defaultLinkColor: graphic("text-secondary", "default link"),
  // A node's outline is what separates it from the one beside it in a dense graph, where fills of the
  // same surface token abut.
  primaryBorderColor: graphic("fold-rule", "node outline"),
  secondaryBorderColor: graphic("fold-rule", "secondary node outline"),
  tertiaryBorderColor: graphic("fold-rule", "tertiary node outline"),
  nodeBorder: graphic("fold-rule", "flowchart node outline"),
  clusterBorder: graphic("fold-rule", "subgraph outline"),
  noteBorderColor: graphic("fold-rule", "note outline"),
  actorBorder: graphic("fold-rule", "sequence actor box outline"),
  actorLineColor: graphic("fold-rule", "sequence lifeline"),
  labelBoxBorderColor: graphic("fold-rule", "sequence loop label outline"),
  activationBorderColor: graphic("fold-rule", "sequence activation bar outline"),
};

/**
 * Base variables deliberately left to Mermaid, each with why it owes nothing.
 *
 * "Mermaid would supply it" is not itself a reason — that is the silent default this table exists to
 * close. What each entry records is that the variable carries no colour a reader depends on, or is not a
 * colour at all.
 */
export const DECLARED_DEFAULTS: Record<string, string> = {
  fontFamily: "not a colour — set from the application's own font stack alongside this table",
  fontSize: "not a colour",
  darkMode:
    "not a colour — a flag telling Mermaid which direction to derive any value this table does not " +
    "set, so that a derivation still lands on the right side of the page",
};

/** The `--color-*` custom property a table entry reads. */
export const cssVarOf = (token: string): string => `--color-${token}`;

/**
 * Resolve the table through a reader, which is what makes it testable: the caller supplies the lookup,
 * so this function has no DOM in it and the tests need no document.
 *
 * An entry whose token resolves empty is **dropped** rather than given a literal fallback. A literal is
 * the thing this table forbids, and a token absent at runtime means the stylesheet has not been applied
 * at all, in which case nothing on the page has its colours and one diagram is not the problem. What
 * keeps this unreachable in practice is `contrast.test.ts`, which asserts every token named here is
 * defined in both of `global.css`'s theme blocks — a typo fails a test rather than quietly degrading a
 * diagram to Mermaid's own palette.
 */
export function resolveDiagramColors(read: (cssVar: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [mermaidVar, { token }] of Object.entries(DIAGRAM_COLORS)) {
    const value = read(cssVarOf(token)).trim();
    if (value) out[mermaidVar] = value;
  }
  return out;
}

/** The reader the application uses: the custom properties actually applied to `root`. */
export const cssVarReader =
  (root: Element) =>
  (cssVar: string): string =>
    getComputedStyle(root).getPropertyValue(cssVar);
