import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChangeDetail, SearchResult } from "@spekjs/core";
import { StaticAdapter, type DemoData } from "./StaticAdapter.js";

// The static build is the surface issue #52 was filed against: its corpus came from `artifact.content`,
// and a tasks artifact carried only the parsed structure, so every word of tasks.md was invisible.

function change(slug: string, artifacts: ChangeDetail["artifacts"]): ChangeDetail {
  return {
    slug,
    status: slug.startsWith("2026-") ? "archived" : "active",
    createdDate: null,
    archivedDate: null,
    schema: null,
    defaultSchema: null,
    artifacts,
    metadata: null,
  } as unknown as ChangeDetail;
}

function adapterFor(data: Partial<DemoData>): StaticAdapter {
  (globalThis as unknown as Record<string, unknown>).window = {
    __DEMO_DATA__: { specDetails: {}, changeDetails: {}, ...data },
  };
  return new StaticAdapter();
}

async function search(data: Partial<DemoData>, query: string): Promise<SearchResult[]> {
  return adapterFor(data).search(query);
}

test("a term only in a task's text is found", async () => {
  const results = await search(
    {
      changeDetails: {
        c: change("c", [
          { id: "proposal", title: "Proposal", kind: "markdown", file: "proposal.md", content: "why" },
          {
            id: "tasks",
            title: "Tasks",
            kind: "tasks",
            file: "tasks.md",
            content: "## Group\n\n- [ ] 1.1 wire up TASKTOKEN\n",
            tasks: { total: 1, completed: 0, sections: [] },
          },
        ]),
      },
    },
    "TASKTOKEN",
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].file, "tasks.md");
});

test("a query spanning two artifacts matches neither", async () => {
  // The old adapter joined every artifact's content with a newline and searched the join.
  const results = await search(
    {
      changeDetails: {
        c: change("c", [
          { id: "design", title: "Design", kind: "markdown", file: "design.md", content: "alpha" },
          { id: "proposal", title: "Proposal", kind: "markdown", file: "proposal.md", content: "beta" },
        ]),
      },
    },
    "alphabeta",
  );
  assert.deepEqual(results, []);
});

test("change results are titled, not shown as raw slugs", async () => {
  const results = await search(
    {
      changeDetails: {
        "2026-09-10-unified-search-semantics": change("2026-09-10-unified-search-semantics", [
          { id: "proposal", title: "Proposal", kind: "markdown", file: "proposal.md", content: "TOKEN" },
        ]),
      },
    },
    "TOKEN",
  );
  assert.equal(results[0].title, "unified search semantics");
  assert.equal(results[0].status, "archived");
});

test("a spec topic still matches by name", async () => {
  const results = await search(
    {
      specDetails: {
        "dashboard-view": { content: "unrelated body" },
      } as unknown as DemoData["specDetails"],
    },
    "dashboard",
  );
  assert.deepEqual(
    results.map((r) => r.topic),
    ["dashboard-view"],
  );
});

test("the delta specs artifact is not indexed", async () => {
  const results = await search(
    {
      changeDetails: {
        c: change("c", [
          { id: "proposal", title: "Proposal", kind: "markdown", file: "proposal.md", content: "why" },
          {
            id: "specs",
            title: "Specs",
            kind: "specs",
            specs: [{ topic: "t", content: "DELTAONLYTOKEN" }],
          },
        ]),
      },
    },
    "DELTAONLYTOKEN",
  );
  assert.deepEqual(results, []);
});
