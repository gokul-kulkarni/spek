import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openspecRouter } from "./openspec.js";

// The router is mounted on a throwaway app rather than importing server/index.ts, which calls
// listen() at import time. Search is pure filesystem plus the core rule, so it needs no CLI runner stub.
let server: Server;
let base: string;
// Every tempRepo() tree, removed in after() so a test run leaves no spek-search-test-* dirs behind.
const tempRepos: string[] = [];

before(async () => {
  const app = express();
  app.use("/api/openspec", openspecRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const repo of tempRepos) fs.rmSync(repo, { recursive: true, force: true });
});

function tempRepo(files: Record<string, string>): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "spek-search-test-"));
  tempRepos.push(repo);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(repo, "openspec", rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return repo;
}

interface SearchResult {
  type: "spec" | "change";
  slug?: string;
  topic?: string;
  file?: string;
  context: string;
  status?: "active" | "archived";
}

async function rawSearch(repo: string, query: string): Promise<Response> {
  return fetch(`${base}/api/openspec/search?dir=${encodeURIComponent(repo)}${query}`);
}

async function search(repo: string, q: string): Promise<SearchResult[]> {
  const res = await fetch(
    `${base}/api/openspec/search?dir=${encodeURIComponent(repo)}&q=${encodeURIComponent(q)}`,
  );
  assert.equal(res.status, 200);
  return (await res.json()) as SearchResult[];
}

test("search finds content inside a data (.yaml) artifact", async () => {
  const repo = tempRepo({
    "changes/add-events/proposal.md": "## Why\nEvent driven change.\n",
    "changes/add-events/asyncapi.yaml":
      "asyncapi: 3.0.0\nchannels:\n  userSignedUp:\n    address: user.signedup\n",
  });
  const results = await search(repo, "userSignedUp");
  assert.ok(
    results.some((r) => r.type === "change" && r.slug === "add-events"),
    "the change whose asyncapi.yaml holds the match is returned",
  );
});

test("search finds content inside a .json data artifact", async () => {
  const repo = tempRepo({
    "changes/add-config/proposal.md": "## Why\n",
    "changes/add-config/settings.json": '{ "retentionPolicyDays": 42 }\n',
  });
  const results = await search(repo, "retentionPolicyDays");
  assert.ok(
    results.some((r) => r.type === "change" && r.slug === "add-config"),
    "the change whose settings.json holds the match is returned",
  );
});

test("a verbatim term deep inside a document is found", async () => {
  // Fuse's default location/distance scored an exact match past ~40 characters out of the results
  // entirely, which is issue #51. The term here sits well beyond that.
  const repo = tempRepo({
    "specs/deep/spec.md": "## Purpose\n" + "filler text. ".repeat(200) + "\nUNIQUETOKEN\n",
  });
  const results = await search(repo, "UNIQUETOKEN");
  assert.deepEqual(
    results.map((r) => r.topic),
    ["deep"],
  );
});

test("a change matching in three files is listed once", async () => {
  const repo = tempRepo({
    "changes/c/proposal.md": "TOKEN in proposal",
    "changes/c/design.md": "TOKEN in design",
    "changes/c/tasks.md": "- [ ] 1.1 TOKEN in tasks",
  });
  const results = await search(repo, "TOKEN");
  assert.equal(results.filter((r) => r.slug === "c").length, 1);
});

test("task text is searchable", async () => {
  const repo = tempRepo({
    "changes/c/proposal.md": "## Why\n",
    "changes/c/tasks.md": "## Group\n\n- [ ] 1.1 wire up TASKTOKEN\n",
  });
  const results = await search(repo, "TASKTOKEN");
  assert.equal(results.length, 1);
  assert.equal(results[0].file, "tasks.md");
});

test("an absent q is a 400, an empty or blank one is an empty array", async () => {
  const repo = tempRepo({ "specs/a/spec.md": "body" });
  assert.equal((await rawSearch(repo, "")).status, 400);
  const empty = await rawSearch(repo, "&q=");
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), []);
  const blank = await rawSearch(repo, "&q=%20%20");
  assert.equal(blank.status, 200);
  assert.deepEqual(await blank.json(), []);
});

test("a repeated q parameter is rejected rather than crashing", async () => {
  const repo = tempRepo({ "specs/a/spec.md": "body" });
  assert.equal((await rawSearch(repo, "&q=a&q=b")).status, 400);
});

test("archived results are marked and ordered newest first", async () => {
  const repo = tempRepo({
    "changes/archive/2026-02-13-old/proposal.md": "TOKEN",
    "changes/archive/2026-08-22-new/proposal.md": "TOKEN",
    "changes/active-one/proposal.md": "TOKEN",
  });
  const results = await search(repo, "TOKEN");
  assert.deepEqual(
    results.map((r) => r.slug),
    ["active-one", "2026-08-22-new", "2026-02-13-old"],
  );
  assert.equal(results[1].status, "archived");
  assert.equal(results[0].status, "active");
});
