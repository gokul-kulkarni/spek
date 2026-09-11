package com.spek.intellij.core

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SearchServiceTest {

    private val tempDirs = mutableListOf<File>()

    private fun mkRepo(files: Map<String, String>): File {
        val repo = Files.createTempDirectory("spek-search-kt-").toFile()
        tempDirs.add(repo)
        for ((rel, content) in files) {
            val full = File(repo, "openspec/$rel")
            full.parentFile.mkdirs()
            full.writeText(content)
        }
        return repo
    }

    @AfterTest
    fun cleanup() {
        tempDirs.forEach { it.deleteRecursively() }
    }

    // The regression this pins: for a slug match the reported snippet must come from a markdown file, not
    // the alphabetically-first data file. `asyncapi.yaml` sorts before `design.md` by name. But the search
    // iterates markdown-first (rootArtifacts order), so a slug search previews the design prose, not YAML.
    @Test
    fun slugMatchPreviewsMarkdownNotTheAlphabeticallyFirstDataFile() {
        val repo = mkRepo(
            mapOf(
                "changes/add-events/design.md" to "# Design\nEvent-driven design prose.\n",
                "changes/add-events/asyncapi.yaml" to "asyncapi: 3.0.0\ndeadLetterId: dlq-1\n",
            ),
        )
        val hits = SearchService.search(repo.path, "add-events").filter { it.type == "change" }
        assertEquals(1, hits.size)
        assertEquals("design.md", hits[0].file, "a slug match must preview markdown, not asyncapi.yaml")
    }

    // The other half of the fix: a data file must still be reachable for a content-only match (a query
    // that is not in the slug and not in any markdown file).
    @Test
    fun contentOnlyMatchInADataFileIsStillFound() {
        val repo = mkRepo(
            mapOf(
                "changes/add-events/design.md" to "# Design\nEvent-driven design prose.\n",
                "changes/add-events/asyncapi.yaml" to "asyncapi: 3.0.0\ndeadLetterId: dlq-1\n",
            ),
        )
        val hits = SearchService.search(repo.path, "deadLetterId").filter { it.type == "change" }
        assertEquals(1, hits.size)
        assertNotNull(hits[0].file)
        assertEquals("asyncapi.yaml", hits[0].file, "content unique to the data file is still searchable")
    }

    @Test
    fun aVerbatimTermPastTheFirstThousandCharactersIsFound() {
        val repo = mkRepo(mapOf("specs/deep/spec.md" to "x".repeat(1200) + "\nUNIQUETOKEN\n"))
        val hits = SearchService.search(repo.path, "UNIQUETOKEN")
        assertEquals(1, hits.size)
        assertEquals("deep", hits[0].topic)
    }

    @Test
    fun taskTextIsSearchable() {
        val repo = mkRepo(
            mapOf(
                "changes/c/proposal.md" to "## Why\n",
                "changes/c/tasks.md" to "## Group\n\n- [ ] 1.1 wire up TASKTOKEN\n",
            ),
        )
        val hits = SearchService.search(repo.path, "TASKTOKEN")
        assertEquals(1, hits.size)
        assertEquals("tasks.md", hits[0].file)
    }

    @Test
    fun aChangeMatchingInThreeFilesIsListedOnce() {
        val repo = mkRepo(
            mapOf(
                "changes/c/proposal.md" to "TOKEN in proposal",
                "changes/c/design.md" to "TOKEN in design",
                "changes/c/tasks.md" to "- [ ] 1.1 TOKEN in tasks",
            ),
        )
        assertEquals(1, SearchService.search(repo.path, "TOKEN").size)
    }

    // A slug match makes every document match. The result must still come from the file that actually
    // contains the query, or the reader gets a snippet with nothing they typed in it.
    @Test
    fun aTextualOccurrenceWinsOverAnEarlierNameOnlyMatch() {
        val repo = mkRepo(
            mapOf(
                "changes/add-oauth/design.md" to "no occurrence here",
                "changes/add-oauth/tasks.md" to "- [ ] 1.1 wire up oauth callback",
            ),
        )
        val hits = SearchService.search(repo.path, "oauth")
        assertEquals(1, hits.size)
        assertEquals("tasks.md", hits[0].file)
        assertTrue(hits[0].context.contains("oauth"))
    }

    @Test
    fun aQueryCopiedFromAResultCardFindsItAgain() {
        val repo = mkRepo(mapOf("changes/unified-search-semantics/proposal.md" to "nothing relevant"))
        val hits = SearchService.search(repo.path, "unified search semantics")
        assertEquals(1, hits.size)
        assertEquals("unified search semantics", hits[0].title)
    }

    @Test
    fun archivedResultsAreMarkedAndOrderedNewestFirst() {
        val repo = mkRepo(
            mapOf(
                "changes/archive/2026-02-13-old/proposal.md" to "TOKEN",
                "changes/archive/2026-08-22-new/proposal.md" to "TOKEN",
                "changes/active-one/proposal.md" to "TOKEN",
            ),
        )
        val hits = SearchService.search(repo.path, "TOKEN")
        assertEquals(listOf("active-one", "2026-08-22-new", "2026-02-13-old"), hits.map { it.slug })
        assertEquals("active", hits[0].status)
        assertEquals("archived", hits[1].status)
    }

    @Test
    fun aBlankQueryReturnsNothing() {
        val repo = mkRepo(mapOf("specs/a/spec.md" to "anything"))
        for (q in listOf("", "   ", "\t")) assertEquals(emptyList(), SearchService.search(repo.path, q))
    }

    @Test
    fun dotEntriesContributeNothing() {
        val repo = mkRepo(
            mapOf(
                "changes/.scratch/proposal.md" to "hidden",
                "changes/real/proposal.md" to "visible",
                "changes/real/.draft.md" to "hidden too",
            ),
        )
        val docs = SearchService.collectDocuments(repo.path)
        assertEquals(listOf("real/proposal.md"), docs.map { "${it.name}/${it.file}" })
    }

    @Test
    fun theDeltaSpecsTreeIsNotIndexed() {
        val repo = mkRepo(
            mapOf(
                "changes/c/proposal.md" to "why",
                "changes/c/specs/topic/spec.md" to "DELTAONLYTOKEN",
            ),
        )
        assertEquals(emptyList(), SearchService.search(repo.path, "DELTAONLYTOKEN"))
    }

    // U+0130 expands to two code units under whole-string lowercasing in JavaScript and collapses to one
    // here. Folding per code unit is what makes the two sides agree and keeps offsets in the original.
    @Test
    fun snippetOffsetsAreLocatedInTheOriginalText() {
        val text = "\u0130" + "a".repeat(200) + "TOKEN" + "b".repeat(200)
        val repo = mkRepo(mapOf("specs/foo/spec.md" to text))
        val hits = SearchService.search(repo.path, "TOKEN")
        assertEquals("..." + "a".repeat(100) + "TOKEN" + "b".repeat(100) + "...", hits[0].context)
    }

    @Test
    fun orderingUsesCodeUnitsNotLocaleCollation() {
        val repo = mkRepo(mapOf("specs/specdiff/spec.md" to "TOKEN", "specs/spec-diff/spec.md" to "TOKEN"))
        assertEquals(listOf("spec-diff", "specdiff"), SearchService.search(repo.path, "TOKEN").map { it.topic })
    }

    @Test
    fun aSpecResultCarriesNoChangeStatus() {
        val repo = mkRepo(mapOf("specs/a/spec.md" to "TOKEN"))
        assertNull(SearchService.search(repo.path, "TOKEN")[0].status)
    }
}
