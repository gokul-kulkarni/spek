import type {
  OverviewData,
  SpecInfo,
  SpecDetail,
  SpecVersionContent,
  ChangesData,
  ChangeDetail,
  SearchResult,
  BrowseData,
  DetectData,
  GraphData,
  WorktreeInfo,
  SchemasResponse,
  SchemaReadResult,
  SchemaDefinition,
} from "@spekjs/core";
import {
  changeSearchDocuments,
  searchDocuments,
  specSearchDocument,
  type SearchDocument,
} from "@spekjs/core/search";
import type { ApiAdapter, AggregationPrefs } from "./types.js";
import { getAggregatePref, setAggregatePref } from "../utils/aggregatePref.js";
import { getJjWorkspacePref, setJjWorkspacePref } from "../utils/jjWorkspacePref.js";

export interface DemoData {
  overview: OverviewData;
  specs: SpecInfo[];
  specDetails: Record<string, SpecDetail>;
  changes: ChangesData;
  changeDetails: Record<string, ChangeDetail>;
  specVersions: Record<string, Record<string, string>>;
  graphData: GraphData;
  // Captured at build time, so the demo needs no openspec CLI and no filesystem at view time.
  // Optional: a demo payload built before schema browsing existed still loads.
  schemas?: SchemasResponse;
  schemaDetails?: Record<string, SchemaDefinition>;
}

export class StaticAdapter implements ApiAdapter {
  private data: DemoData;

  constructor() {
    this.data = (window as unknown as Record<string, unknown>).__DEMO_DATA__ as DemoData;
    if (!this.data) {
      throw new Error("Demo data not found. Ensure __DEMO_DATA__ is set.");
    }
  }

  getOverview(): Promise<OverviewData> {
    return Promise.resolve(this.data.overview);
  }

  getSpecs(): Promise<SpecInfo[]> {
    return Promise.resolve(this.data.specs);
  }

  getSpec(topic: string): Promise<SpecDetail> {
    const spec = this.data.specDetails[topic];
    if (!spec) return Promise.reject(new Error(`Spec not found: ${topic}`));
    return Promise.resolve(spec);
  }

  getSpecAtChange(topic: string, slug: string): Promise<SpecVersionContent> {
    const versions = this.data.specVersions?.[topic];
    const content = versions?.[slug];
    if (content === undefined) return Promise.reject(new Error(`Spec version not found: ${topic}@${slug}`));
    return Promise.resolve({ content });
  }

  getChanges(): Promise<ChangesData> {
    return Promise.resolve(this.data.changes);
  }

  getChange(slug: string): Promise<ChangeDetail> {
    const change = this.data.changeDetails[slug];
    if (!change) return Promise.reject(new Error(`Change not found: ${slug}`));
    return Promise.resolve(change);
  }

  search(query: string): Promise<SearchResult[]> {
    // The same rule every other surface runs, over documents built from the embedded records rather than
    // from files. Nothing about matching, ordering, snippets or titles is decided here — the static build
    // is a surface of spek, not a second search engine.
    const documents: SearchDocument[] = [];
    for (const [topic, detail] of Object.entries(this.data.specDetails)) {
      documents.push(specSearchDocument(topic, detail.content));
    }
    for (const detail of Object.values(this.data.changeDetails)) {
      documents.push(...changeSearchDocuments(detail));
    }
    return Promise.resolve(searchDocuments(documents, query));
  }

  browse(): Promise<BrowseData> {
    return Promise.resolve({ path: "/", entries: [] });
  }

  detect(): Promise<DetectData> {
    return Promise.resolve({ hasOpenSpec: true });
  }

  async resync(): Promise<void> {
    // no-op
  }

  getGraphData(): Promise<GraphData> {
    return Promise.resolve(this.data.graphData);
  }

  // The demo is a single source (no cross-worktree aggregation); return the embedded worktree list,
  // which is usually empty.
  getWorktrees(): Promise<WorktreeInfo[]> {
    return Promise.resolve(this.data.changes.worktrees ?? []);
  }

  getSchemas(): Promise<SchemasResponse> {
    return Promise.resolve(
      this.data.schemas ?? {
        defaultSchema: null,
        schemas: [],
        degradedReason: null,
        unresolved: [],
      },
    );
  }

  // Usage is read back off the embedded catalog rather than embedded a second time beside each
  // definition — it was already computed there by the same rule the server uses, and two copies of a
  // count in one payload is one copy too many to keep honest.
  getSchema(name: string): Promise<SchemaReadResult> {
    const schema = this.data.schemaDetails?.[name];
    if (!schema) return Promise.resolve({ ok: false, reason: "not-found" });
    const usage = this.data.schemas?.schemas.find((s) => s.name === name)?.usage ?? null;
    return Promise.resolve({ ok: true, schema, usage });
  }

  getAggregationPrefs(): Promise<AggregationPrefs> {
    return Promise.resolve({ aggregate: getAggregatePref(), includeJj: getJjWorkspacePref() });
  }

  setAggregationPrefs(aggregate: boolean, includeJj: boolean): Promise<void> {
    setAggregatePref(aggregate);
    setJjWorkspacePref(includeJj);
    return Promise.resolve();
  }
}
