import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import {
  scanOpenSpec,
  searchRepository,
  scanOpenSpecAggregated,
  readSpec,
  readChange,
  readSpecAtChange,
  resyncTimestamps,
  buildGraphDataAggregated,
  listWorkspaces,
  toWorktreeSource,
  listSchemas,
  readSchema,
  groupSchemaUsage,
  countSchemaUsage,
  clearSchemaCache,
} from "@spekjs/core";

export class MessageHandler {
  constructor(private readonly workspacePath: string) {}

  /**
   * In VS Code the aggregation scope is **always driven by settings**
   * (`spek.aggregateWorktrees` / `spek.aggregateJjWorkspaces`); values sent from the webview are
   * ignored on purpose. The header control in VS Code is the UI for these two settings — it reads
   * them (getAggregationPrefs) and writes them back (setAggregationPrefs). Letting the webview value
   * override the settings would make the settings ineffective (the webview always carries its own
   * value). Settings are the single source of truth.
   */
  private jjEnabled(_includeJj?: boolean): boolean {
    return vscode.workspace
      .getConfiguration("spek")
      .get<boolean>("aggregateJjWorkspaces", false);
  }

  private aggregateEnabled(_aggregate?: boolean): boolean {
    return vscode.workspace
      .getConfiguration("spek")
      .get<boolean>("aggregateWorktrees", true);
  }

  async handle(method: string, params?: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "getOverview":
        return this.getOverview(
          params?.aggregate as boolean | undefined,
          params?.includeJj as boolean | undefined,
        );
      case "getSpecs":
        return this.getSpecs();
      case "getSpec":
        return this.getSpec(params?.topic as string);
      case "getSpecAtChange":
        return this.getSpecAtChange(params?.topic as string, params?.slug as string);
      case "getChanges":
        return this.getChanges(
          params?.aggregate as boolean | undefined,
          params?.includeJj as boolean | undefined,
        );
      case "getChange":
        return this.getChange(params?.slug as string, params?.wt as string | undefined);
      case "search":
        return this.search(params?.query as string);
      case "browse":
        return this.browse(params?.path as string);
      case "detect":
        return this.detect(params?.path as string);
      case "resync":
        return this.resync();
      case "getGraphData":
        return this.getGraphData(
          params?.aggregate as boolean | undefined,
          params?.includeJj as boolean | undefined,
        );
      case "getWorktrees":
        return this.getWorktrees(params?.includeJj as boolean | undefined);
      case "getSchemas":
        return this.getSchemas(
          params?.aggregate as boolean | undefined,
          params?.includeJj as boolean | undefined,
        );
      case "getSchema":
        return this.getSchema(
          params?.name as string,
          params?.aggregate as boolean | undefined,
          params?.includeJj as boolean | undefined,
        );
      case "getAggregationPrefs":
        return this.getAggregationPrefs();
      case "setAggregationPrefs":
        return this.setAggregationPrefs(
          params?.aggregate as boolean,
          params?.includeJj as boolean,
        );
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async getOverview(aggregate?: boolean, includeJj?: boolean) {
    const scan = await scanOpenSpecAggregated(this.workspacePath, {
      aggregate: this.aggregateEnabled(aggregate),
      includeJj: this.jjEnabled(includeJj),
    });
    let totalTasks = 0;
    let completedTasks = 0;
    for (const change of [...scan.activeChanges, ...scan.archivedChanges]) {
      if (change.taskStats) {
        totalTasks += change.taskStats.total;
        completedTasks += change.taskStats.completed;
      }
    }
    return {
      specsCount: scan.specs.length,
      changesCount: {
        active: scan.activeChanges.length,
        archived: scan.archivedChanges.length,
      },
      taskStats: { total: totalTasks, completed: completedTasks },
    };
  }

  private async getSpecs() {
    const scan = await scanOpenSpec(this.workspacePath);
    return scan.specs;
  }

  private async getSpec(topic: string) {
    const result = await readSpec(this.workspacePath, topic);
    if (!result) throw new Error("Spec not found");
    return result;
  }

  private getSpecAtChange(topic: string, slug: string) {
    const result = readSpecAtChange(this.workspacePath, topic, slug);
    if (!result) throw new Error("Spec version not found");
    return result;
  }

  private async getChanges(aggregate?: boolean, includeJj?: boolean) {
    const scan = await scanOpenSpecAggregated(this.workspacePath, {
      aggregate: this.aggregateEnabled(aggregate),
      includeJj: this.jjEnabled(includeJj),
    });
    return {
      active: scan.activeChanges,
      archived: scan.archivedChanges,
      worktrees: scan.worktrees,
      aggregated: scan.aggregated,
      defaultSchema: scan.defaultSchema,
    };
  }

  private async getChange(slug: string, wt?: string) {
    // 指定 wt 時，解析對應 worktree 路徑後再讀
    let targetDir = this.workspacePath;
    let source: ReturnType<typeof toWorktreeSource> | undefined;
    if (wt) {
      const match = (await listWorkspaces(this.workspacePath)).find((w) => w.key === wt);
      if (match) {
        targetDir = match.path;
        source = toWorktreeSource(match);
      }
    }
    const result = await readChange(targetDir, slug);
    if (!result) throw new Error("Change not found");
    if (source) result.source = source;
    return result;
  }

  private search(query: string) {
    // The rule, the corpus and the ordering all live in @spekjs/core. This host held a verbatim copy of
    // the web server's Fuse index, which is how issue #51 shipped here too without anyone reporting it.
    if (query === undefined || query === null) throw new Error("query is required");
    return searchRepository(this.workspacePath, query);
  }

  private browse(dirPath?: string) {
    const resolved = path.resolve(dirPath || os.homedir());
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Directory not found: ${resolved}`);
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file",
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return { path: resolved, entries: items };
  }

  private detect(dirPath: string) {
    if (!dirPath) throw new Error("path is required");
    const resolved = path.resolve(dirPath);
    const openspecDir = path.join(resolved, "openspec");
    const configPath = path.join(openspecDir, "config.yaml");

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      const schemaMatch = content.match(/^schema:\s*(.+)$/m);
      return { hasOpenSpec: true, schema: schemaMatch ? schemaMatch[1].trim() : "unknown" };
    }

    // Fallback: 檢查 openspec/specs/ 或 openspec/changes/ 是否存在
    const hasSpecs = fs.existsSync(path.join(openspecDir, "specs"));
    const hasChanges = fs.existsSync(path.join(openspecDir, "changes"));
    if (hasSpecs || hasChanges) {
      return { hasOpenSpec: true, schema: "unknown" };
    }

    return { hasOpenSpec: false };
  }

  private async resync() {
    await resyncTimestamps(this.workspacePath);
    // Schemas resolve from three places and only the workspace's own openspec/schemas/ is watched.
    // A schema promoted to the machine-global directory, or edited there, produces no event this
    // host can see — so Refresh has to be the authoritative way to pick it up.
    clearSchemaCache();
    return { ok: true };
  }

  private getGraphData(aggregate?: boolean, includeJj?: boolean) {
    return buildGraphDataAggregated(this.workspacePath, {
      aggregate: this.aggregateEnabled(aggregate),
      includeJj: this.jjEnabled(includeJj),
    });
  }

  // Discovery: always enumerate jj workspaces (independent of the setting) so the header control
  // can offer the jj option even while jj aggregation is currently disabled.
  private getWorktrees(includeJj?: boolean) {
    return listWorkspaces(this.workspacePath, { includeJj: includeJj === true });
  }

  // Same shape the web route serves: the catalog joined with the changes using it. Aggregation
  // follows settings here, like every other scan in this host.
  private async getSchemas(aggregate?: boolean, includeJj?: boolean) {
    const [catalog, scan] = await Promise.all([
      listSchemas(this.workspacePath),
      scanOpenSpecAggregated(this.workspacePath, {
        aggregate: this.aggregateEnabled(aggregate),
        includeJj: this.jjEnabled(includeJj),
      }),
    ]);
    return groupSchemaUsage(catalog, scan.activeChanges);
  }

  // Resolves rather than throws when the schema is unreadable: the result carries whether it does
  // not exist or could not be looked up, and the view says which. Usage rides along as the web
  // route does it, so the detail view needs no second request for the catalog.
  private async getSchema(name: string, aggregate?: boolean, includeJj?: boolean) {
    const [result, scan] = await Promise.all([
      readSchema(this.workspacePath, name),
      scanOpenSpecAggregated(this.workspacePath, {
        aggregate: this.aggregateEnabled(aggregate),
        includeJj: this.jjEnabled(includeJj),
      }),
    ]);
    if (!result.ok) return result;
    return { ...result, usage: countSchemaUsage(scan.activeChanges, name) };
  }

  // The header control in VS Code is the UI for these two settings: it reads them here...
  private getAggregationPrefs() {
    return {
      aggregate: this.aggregateEnabled(),
      includeJj: this.jjEnabled(),
    };
  }

  // ...and writes them back at the Workspace scope, so toggling the control edits settings.json.
  private async setAggregationPrefs(aggregate: boolean, includeJj: boolean) {
    const config = vscode.workspace.getConfiguration("spek");
    await config.update("aggregateWorktrees", aggregate, vscode.ConfigurationTarget.Workspace);
    await config.update("aggregateJjWorkspaces", includeJj, vscode.ConfigurationTarget.Workspace);
    return { ok: true };
  }
}
