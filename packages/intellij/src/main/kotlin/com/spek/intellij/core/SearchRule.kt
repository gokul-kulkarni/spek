package com.spek.intellij.core

/**
 * The search rule, mirroring `packages/core/src/search.ts`. One rule in two languages: what a query
 * matches, which document answers it, and in what order. The two are held together by the shared fixture
 * corpus in `test-fixtures/search/`, read by `SearchCorpusTest` here and by `search.corpus.test.ts` there.
 *
 * Obtaining the documents is deliberately separate (SearchService walks the filesystem), because that is
 * the one part a host without a filesystem cannot share.
 */
object SearchRule {

    data class Document(
        /** "spec" | "change" */
        val type: String,
        /** The spec topic or the change slug. */
        val name: String,
        /** The source filename — a change's root file, or `spec.md` for a spec. */
        val file: String,
        val text: String,
        /** Changes only: "active" | "archived". */
        val status: String? = null,
    )

    /** Snippet extent either side of the match, in UTF-16 code units. */
    private const val SNIPPET_RADIUS = 100

    /** Cap for the head-of-document snippet a name-only match gets. */
    private const val HEAD_SNIPPET = 200

    private const val ELLIPSIS = "..."

    private val HUMANISE = Regex("[-_]+")

    private val DATED_SLUG = Regex("""\A(\d{4}-\d{2}-\d{2})-(.+)\z""")

    /**
     * Case folding, one UTF-16 code unit at a time.
     *
     * Deliberately not `text.lowercase()` over the whole string. Two reasons, both load-bearing:
     *
     *  - **It is length-preserving**, so an index into the folded text is the same index into the
     *    original. Snippets are cut from the original, and a fold that changes length silently shifts
     *    every snippet after it.
     *  - **It is what JavaScript can agree with.** Whole-string folding diverges between the two runtimes
     *    on exactly the interesting characters — U+00DF folds to `ss` in JS and stays put here, U+0130
     *    expands in JS and collapses to `i` here. Per-code-unit folding is `Character.toLowerCase` on both
     *    sides.
     *
     * `lowercaseChar()` is locale-independent. `lowercase(Locale)` and Java's `String.toLowerCase()` are
     * not, and under a Turkish default locale would fold `I` to `ı` — the same repository answering
     * differently depending on the machine running the search.
     */
    private fun fold(text: String): String {
        val out = StringBuilder(text.length)
        for (ch in text) out.append(ch.lowercaseChar())
        return out.toString()
    }

    /** `-` and `_` runs to single spaces: the form a slug or topic is *displayed* in. */
    private fun humanise(name: String): String = HUMANISE.replace(name, " ")

    /**
     * A change slug's date prefix and description. Mirrors `parseSlug` in search.ts, which is why it lives
     * beside the rule rather than in the scanner.
     */
    fun parseSlug(slug: String): Pair<String?, String> {
        val match = DATED_SLUG.find(slug)
        return if (match != null) match.groupValues[1] to humanise(match.groupValues[2])
        else null to humanise(slug)
    }

    private fun isLowSurrogate(ch: Char): Boolean = ch.code in 0xDC00..0xDFFF

    /** The snippet around a match, or the head of the document when there is no match to centre on. */
    private fun snippet(text: String, at: Int, length: Int): String {
        if (at < 0) {
            val head = text.take(HEAD_SNIPPET)
            return if (head.length < text.length) head + ELLIPSIS else head
        }
        var start = maxOf(0, at - SNIPPET_RADIUS)
        var end = minOf(text.length, at + length + SNIPPET_RADIUS)
        // Never cut between a surrogate pair: the half left behind is not a character.
        if (start > 0 && isLowSurrogate(text[start])) start += 1
        if (end < text.length && isLowSurrogate(text[end])) end -= 1
        return (if (start > 0) ELLIPSIS else "") + text.substring(start, end) +
            (if (end < text.length) ELLIPSIS else "")
    }

    /**
     * Specs by topic, then active changes by slug, then archived changes by slug **descending**.
     *
     * Archived slugs carry a `YYYY-MM-DD-` prefix and active ones do not, so descending puts the most
     * recently archived first — the direction every other list in spek sorts.
     *
     * Comparison is UTF-16 code-unit order (`compareTo`), never a Collator: ICU collation weakens
     * punctuation, so `spec-diff` and `specdiff` would order differently from the TypeScript side.
     */
    private fun rank(result: SearchResult): Int =
        if (result.type == "spec") 0 else if (result.status == "archived") 2 else 1

    private fun sortResults(results: List<SearchResult>): List<SearchResult> =
        results.sortedWith { a, b ->
            val ra = rank(a)
            val rb = rank(b)
            if (ra != rb) {
                ra - rb
            } else {
                val na = a.topic ?: a.slug ?: ""
                val nb = b.topic ?: b.slug ?: ""
                if (ra == 2) nb.compareTo(na) else na.compareTo(nb)
            }
        }

    /**
     * Run a query over documents.
     *
     * A document matches when its text contains the query, folded; a spec or change also matches on its
     * name or on the humanised form of that name — the form a result card displays, so a query copied off
     * a result finds it again.
     *
     * Each spec and change yields **one** result, taken from the first of its documents whose *text*
     * contains the query. Only when none does — a name match alone — does the first document supply it.
     * Taking the first document that matches by any test is the subtle wrong version: a name match makes
     * every document of that change match, so a real occurrence further down would be discarded in favour
     * of a snippet containing nothing the reader typed.
     */
    fun search(documents: List<Document>, query: String): List<SearchResult> {
        val trimmed = query.trim()
        val q = fold(trimmed)
        if (q.isEmpty()) return emptyList()

        val groups = LinkedHashMap<String, MutableList<Document>>()
        for (doc in documents) {
            groups.getOrPut("${doc.type} ${doc.name}") { mutableListOf() }.add(doc)
        }

        val results = mutableListOf<SearchResult>()
        for (docs in groups.values) {
            val first = docs[0]
            var hitDoc: Document? = null
            var hitAt = -1
            for (doc in docs) {
                val at = fold(doc.text).indexOf(q)
                if (at >= 0) {
                    hitDoc = doc
                    hitAt = at
                    break
                }
            }
            if (hitDoc == null) {
                val name = first.name
                if (!fold(name).contains(q) && !fold(humanise(name)).contains(q)) continue
                hitDoc = first
                hitAt = -1
            }
            results.add(
                SearchResult(
                    type = first.type,
                    title = if (first.type == "change") parseSlug(first.name).second else first.name,
                    slug = if (first.type == "change") first.name else null,
                    topic = if (first.type == "spec") first.name else null,
                    context = snippet(hitDoc.text, hitAt, trimmed.length),
                    file = hitDoc.file,
                    status = first.status,
                )
            )
        }

        return sortResults(results)
    }
}
