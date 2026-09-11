package com.spek.intellij.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * The Kotlin half of the shared search fixture corpus. The same directory is read by
 * `packages/core/src/search.corpus.test.ts`; adding a fixture there is what makes both languages assert
 * a case, with no step anyone has to remember.
 *
 * Narrower than the task-parser corpus on purpose: no generator and no `invalid/` corpus. That corpus
 * exists because the task parser's line-boundary rules differ between the runtimes and because holding
 * two rejection *messages* equal needs a shared source. Search has one such trap — case folding — and
 * otherwise runs on UTF-16 code units in both languages. So this loader asserts only *that* a malformed
 * fixture is rejected, never the wording: two hand-copied message strings with nothing enforcing their
 * equality is the drift this corpus exists to prevent.
 *
 * See openspec/specs/search-semantics.
 */
class SearchCorpusTest {

    @TestFactory
    fun corpus(): List<DynamicTest> =
        SearchCorpus.load(SearchCorpus.configuredDir()).map { fixture ->
            DynamicTest.dynamicTest("search corpus: ${fixture.name}") {
                val actual = SearchRule.search(fixture.input, fixture.query)
                assertEquals(fixture.expected.size, actual.size, fixture.note)
                fixture.expected.forEachIndexed { i, expected ->
                    // A case asserts exactly the fields it states, so a case about ordering need not
                    // restate a hundred characters of context it does not care about.
                    expected.forEach { (key, value) ->
                        assertEquals(value, fieldOf(actual[i], key), "${fixture.name}: result $i field $key")
                    }
                }
            }
        }

    private fun fieldOf(result: SearchResult, key: String): String? = when (key) {
        "type" -> result.type
        "title" -> result.title
        "slug" -> result.slug
        "topic" -> result.topic
        "context" -> result.context
        "file" -> result.file
        "status" -> result.status
        else -> throw IllegalArgumentException("unknown expected field: $key")
    }

    @Test
    fun aFixtureWithALiteralNonAsciiCharacterIsRejected() {
        val literal = "{\"name\":\"x\",\"note\":\"n\",\"input\":[],\"query\":\"İ\",\"expected\":[]}"
        assertFailsWith<IllegalArgumentException> {
            SearchCorpus.checkFixtureBytes(literal.toByteArray(Charsets.UTF_8), "literal.json")
        }
    }
}

object SearchCorpus {

    private const val CORPUS_PROPERTY = "spek.searchCorpus"

    private val json = Json { ignoreUnknownKeys = false }

    data class Fixture(
        val name: String,
        val note: String,
        val input: List<SearchRule.Document>,
        val query: String,
        /** Field name to expected value, per result. Absent fields are not asserted. */
        val expected: List<Map<String, String?>>,
    )

    /**
     * The corpus directory, passed by the build. Absent means the wiring is broken, so this throws rather
     * than skipping: a suite that quietly asserts nothing is the failure this corpus exists to prevent.
     */
    fun configuredDir(): File {
        val configured = System.getProperty(CORPUS_PROPERTY)
            ?: throw IllegalStateException(
                "system property $CORPUS_PROPERTY is not set; the test task must pass the corpus directory",
            )
        return File(configured)
    }

    fun load(dir: File): List<Fixture> {
        val entries = dir.listFiles { file -> file.name.endsWith(".json") }?.sortedBy { it.name }
            ?: throw IllegalStateException("search corpus is not readable at $dir")
        val fixtures = entries.map { file ->
            checkFixtureBytes(file.readBytes(), file.name)
            parseFixture(String(file.readBytes(), Charsets.UTF_8), file.name)
        }
        // A wrong path yielding "0 cases, all passed" reads exactly like a healthy suite.
        require(fixtures.isNotEmpty()) { "search corpus at $dir contains no fixtures" }
        return fixtures
    }

    private fun fail(fileName: String, message: String): Nothing =
        throw IllegalArgumentException("$fileName: $message")

    private fun str(obj: JsonObject, key: String, fileName: String): String {
        val element = obj[key] ?: fail(fileName, "$key is required")
        val primitive = element as? JsonPrimitive ?: fail(fileName, "$key must be a string")
        if (!primitive.isString) fail(fileName, "$key must be a string")
        return primitive.content
    }

    private fun optionalStr(obj: JsonObject, key: String, fileName: String): String? {
        val element = obj[key] ?: return null
        val primitive = element as? JsonPrimitive ?: fail(fileName, "$key must be a string")
        if (!primitive.isString) fail(fileName, "$key must be a string")
        return primitive.content
    }

    private fun document(element: JsonElement, fileName: String): SearchRule.Document {
        val obj = element as? JsonObject ?: fail(fileName, "each input document must be an object")
        val type = str(obj, "type", fileName)
        if (type != "spec" && type != "change") fail(fileName, "document type must be \"spec\" or \"change\"")
        val status = optionalStr(obj, "status", fileName)
        if (status != null && status != "active" && status != "archived") {
            fail(fileName, "document status must be \"active\" or \"archived\" when present")
        }
        return SearchRule.Document(
            type = type,
            name = str(obj, "name", fileName),
            file = str(obj, "file", fileName),
            text = str(obj, "text", fileName),
            status = status,
        )
    }

    fun parseFixture(document: String, fileName: String): Fixture {
        val root = try {
            json.parseToJsonElement(document)
        } catch (e: Exception) {
            fail(fileName, "not valid JSON: ${e.message}")
        }
        val obj = root as? JsonObject ?: fail(fileName, "must be a JSON object")
        val name = str(obj, "name", fileName)
        if (name.isEmpty()) fail(fileName, "name must be a non-empty string")
        val note = str(obj, "note", fileName)
        if (note.isEmpty()) fail(fileName, "note must be a non-empty string")
        val input = (obj["input"] as? JsonArray ?: fail(fileName, "input must be an array of documents"))
            .map { document(it, fileName) }
        val expected = (obj["expected"] as? JsonArray ?: fail(fileName, "expected must be an array of results"))
            .map { element ->
                val result = element as? JsonObject ?: fail(fileName, "each expected result must be an object")
                result.keys.associateWith { key -> optionalStr(result, key, fileName) }
            }
        if (name != fileName.removeSuffix(".json")) fail(fileName, "name must match its filename")
        return Fixture(name, note, input, str(obj, "query", fileName), expected)
    }

    /**
     * The same byte allowlist the task-parser corpus states, for the same reason: a literal non-ASCII
     * character is silently rewritten on the way into a fixture and guts the case it was added for, and
     * the two JSON parsers disagree about which such documents are even valid.
     */
    fun checkFixtureBytes(bytes: ByteArray, fileName: String) {
        for (i in bytes.indices) {
            val b = bytes[i].toInt() and 0xff
            if (b == 0x0a || b == 0x09) continue
            if (b in 0x20..0x7e) continue
            val hex = b.toString(16).padStart(2, '0')
            throw IllegalArgumentException(
                "$fileName: byte $i is 0x$hex; fixtures are printable ASCII plus line feed and tab, " +
                    "with everything else written as a \\u escape",
            )
        }
    }
}
