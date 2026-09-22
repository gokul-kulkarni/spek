import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DIAGRAM_COLORS,
  DECLARED_DEFAULTS,
  cssVarOf,
  resolveDiagramColors,
} from "./diagramTheme";

const SOURCE = readFileSync(fileURLToPath(new URL("./diagramTheme.ts", import.meta.url)), "utf8");

// The rule `ui-package` states for a package with no theme, applied here for a different reason: this
// table's values never pass through a stylesheet, so a literal in it is invisible to every check that
// reads `global.css`. There is no exemption list, because no colour here renders nothing or is the
// absence of light — every entry is a mark a reader looks at.
test("the palette contains no colour literal", () => {
  const literals = SOURCE.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g) ?? [];
  assert.deepEqual(literals, [], `use a --color-* token instead: ${literals.join(", ")}`);
});

test("every entry declares a role, and a surface says why it owes nothing", () => {
  for (const [mermaidVar, entry] of Object.entries(DIAGRAM_COLORS)) {
    assert.ok(entry.token, `${mermaidVar} names no token`);
    assert.ok(entry.label, `${mermaidVar} has no label saying where it reaches the reader`);
    assert.ok(
      entry.role.kind === "text" || entry.role.kind === "graphic" || entry.role.kind === "surface",
      `${mermaidVar} has no role`,
    );
    if (entry.role.kind === "surface") {
      assert.ok(entry.role.reason, `${mermaidVar} is declared a surface but states no reason`);
    }
  }
});

// A variable in both places is a variable whose declaration contradicts itself: the table says the app
// supplies it, and the default list says the app leaves it to Mermaid.
test("a variable is declared once, not both set and left to Mermaid", () => {
  const both = Object.keys(DIAGRAM_COLORS).filter((k) => k in DECLARED_DEFAULTS);
  assert.deepEqual(both, [], `declared twice: ${both.join(", ")}`);
});

test("every declared default states why it owes nothing", () => {
  for (const [name, reason] of Object.entries(DECLARED_DEFAULTS)) {
    assert.ok(reason.length > 10, `${name} is left to Mermaid with no stated reason`);
  }
});

test("resolveDiagramColors maps every variable through its token", () => {
  const resolved = resolveDiagramColors((cssVar) => `<${cssVar}>`);
  assert.deepEqual(Object.keys(resolved).sort(), Object.keys(DIAGRAM_COLORS).sort());
  assert.equal(resolved.textColor, `<${cssVarOf(DIAGRAM_COLORS.textColor.token)}>`);
  assert.equal(resolved.lineColor, `<${cssVarOf(DIAGRAM_COLORS.lineColor.token)}>`);
});

// Dropping beats substituting: Mermaid's base default for one key is a worse answer than a literal
// nobody measured, but a literal is the one thing this table may not contain.
test("a token that resolves empty is dropped rather than given a literal", () => {
  const resolved = resolveDiagramColors((cssVar) =>
    cssVar === cssVarOf(DIAGRAM_COLORS.lineColor.token) ? "   " : "#000",
  );
  assert.equal("lineColor" in resolved, false);
  assert.ok(Object.keys(resolved).length > 0);
});

test("whitespace around a resolved value is trimmed", () => {
  // getComputedStyle returns a leading space for a custom property declared as `--x: #fff`.
  const resolved = resolveDiagramColors(() => "  #123456  ");
  assert.equal(resolved.textColor, "#123456");
});
