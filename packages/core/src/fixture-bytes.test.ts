// The fixture byte guard, shared by every fixture corpus in this package.
//
// It is named *.test.ts so the build's `exclude` keeps it out of `dist` — a helper under src/ would
// otherwise be compiled and published — but it registers no tests, so importing it costs nothing. Both
// test-fixtures/task-parser/ and test-fixtures/search/ call it rather than restating the rule, since a
// second copy of a rule is precisely what these corpora exist to prevent.

// Byte-level hygiene, stated as an allowlist. "No control characters" would reject the corpus itself
// — pretty-printed JSON is full of U+000A and U+0009 — while still missing U+0085 and U+00A0, which
// are not control characters at the byte level at all (they are C2 85 and C2 A0 in UTF-8, and
// JSON.parse accepts both raw).
//
// Allowing only printable ASCII plus LF and TAB subsumes the whole denylist the spec names — CR,
// U+0085, U+2028, U+2029, U+00A0, U+FEFF and every other C0/C1 character are either control bytes or
// non-ASCII — and needs no list to keep up to date. Anything else a case needs is written as a \u
// escape, which is the point of the format.
//
// This is not optional tidiness. The two JSON parsers disagree about such files: a raw LF, CR or
// U+001C inside a string literal is rejected by JSON.parse and accepted by kotlinx-serialization, so
// a fixture whose escape got flattened fails hard here and passes silently on the Kotlin side.
export function checkFixtureBytes(bytes: Uint8Array, file: string): void {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0a || b === 0x09) continue;
    if (b >= 0x20 && b <= 0x7e) continue;
    throw new Error(
      `${file}: ` +
      `byte ${i} is 0x${b.toString(16).padStart(2, "0")}; fixtures are printable ASCII plus line ` +
        `feed and tab, with everything else written as a \\u escape`,
    );
  }
}
