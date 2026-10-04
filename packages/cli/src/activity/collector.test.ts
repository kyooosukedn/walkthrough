import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createActivityStore } from "./store.js";
import { createActivityCollector } from "./collector.js";

const event = (overrides: Record<string, unknown> = {}) => ({ version: 1, sessionId: "session-1", at: "2026-10-04T12:00:00.000Z", host: "claude", kind: "file", phase: "completed", title: "Edited src/main.ts", path: "src/main.ts", ...overrides });

async function fixture({ simulateBackpressure = false }: { simulateBackpressure?: boolean } = {}) {
  const base = await mkdtemp(join(tmpdir(), "walkthrough-activity-"));
  const root = join(base, "repo");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/main.ts"), "export const value = 1;\n");
  await writeFile(join(root, ".env"), "SECRET=value\n");
  await writeFile(join(base, "outside.ts"), "outside\n");
  const store = createActivityStore({ maxEvents: 2 });
  const collector = createActivityCollector({ repoRoot: root, token: "test-token", store });
  const server = createServer((req, res) => {
    if (simulateBackpressure && req.url === "/activity/stream") {
      const write = res.write.bind(res);
      res.write = ((chunk: string) => { write(chunk); return false; }) as typeof res.write;
    }
    collector.handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server address");
  const url = `http://127.0.0.1:${address.port}`;
  return { base, root, store, collector, url, async close() { collector.close(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(base, { recursive: true, force: true }); } };
}

async function post(url: string, payload: unknown, token = "test-token") {
  return fetch(url + "/activity/events", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

test("collector authenticates posts and assigns ordered bounded sequences", async () => {
  const fx = await fixture();
  try {
    assert.equal((await post(fx.url, event(), "wrong")).status, 401);
    for (let i = 0; i < 3; i++) {
      const response = await post(fx.url, event({ title: `Action ${i}`, sequence: 999 }));
      assert.equal(response.status, 201);
      assert.equal((await response.json() as { sequence: number }).sequence, i + 1);
    }
    assert.deepEqual(fx.store.replay().map((item) => item.sequence), [2, 3]);
  } finally { await fx.close(); }
});

test("collector rejects oversized and unsafe payloads without storing them", async () => {
  const fx = await fixture();
  try {
    for (const bad of [event({ path: "../outside.ts" }), event({ path: ".env" }), event({ path: "C:/outside.ts" }), event({ path: "src/missing.ts" }), event({ title: "x".repeat(201) }), event({ detail: "x".repeat(2001) }), event({ detail: "API_KEY=secret-value" }), event({ detail: "OPENAI_API_KEY=secret-value" }), event({ detail: "AWS_SECRET_ACCESS_KEY=secret-value" }), event({ rawPrompt: "secret" })]) {
      assert.equal((await post(fx.url, bad)).status, 400);
    }
    try {
      await symlink(join(fx.base, "outside.ts"), join(fx.root, "src/link.ts"));
      assert.equal((await post(fx.url, event({ path: "src/link.ts" }))).status, 400);
      await symlink(join(fx.root, ".env"), join(fx.root, "src/config.ts"));
      assert.equal((await post(fx.url, event({ path: "src/config.ts" }))).status, 400);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
    assert.equal((await post(fx.url, event({ detail: "x".repeat(20_000) }))).status, 413);
    assert.equal(fx.store.replay().length, 0);
  } finally { await fx.close(); }
});

test("collector keeps one session and rejects foreign browser origins", async () => {
  const fx = await fixture();
  try {
    assert.equal((await post(fx.url, event())).status, 201);
    assert.equal((await post(fx.url, event({ sessionId: "another-session" }))).status, 400);
    const crossOrigin = await fetch(fx.url + "/activity/stream", { headers: { Cookie: fx.collector.viewerCookie().split(";")[0], Origin: "https://foreign.example" } });
    assert.equal(crossOrigin.status, 403);
    assert.equal(fx.store.replay().length, 1);
  } finally { await fx.close(); }
});

test("cookie stream replays retained events and honors Last-Event-ID", async () => {
  const fx = await fixture();
  try {
    await post(fx.url, event({ title: "First" }));
    await post(fx.url, event({ title: "Second" }));
    const noCookie = await fetch(fx.url + "/activity/stream");
    assert.equal(noCookie.status, 401);
    const cookie = fx.collector.viewerCookie().split(";")[0];
    const response = await fetch(fx.url + "/activity/stream", { headers: { Cookie: cookie, "Last-Event-ID": "1" } });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    assert.match(text, /id: 2\n/);
    assert.match(text, /Second/);
    assert.doesNotMatch(text, /First/);
    await reader.cancel();
    assert.match(fx.collector.viewerCookie(), /HttpOnly; SameSite=Strict/);
  } finally { await fx.close(); }
});

test("connected viewer receives an event posted later", async () => {
  const fx = await fixture();
  try {
    const cookie = fx.collector.viewerCookie().split(";")[0];
    const responsePromise = fetch(fx.url + "/activity/stream", { headers: { Cookie: cookie } });
    const response = await responsePromise;
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    const read = reader.read();
    assert.equal((await post(fx.url, event({ title: "Live edit" }))).status, 201);
    const chunk = await read;
    assert.match(new TextDecoder().decode(chunk.value), /Live edit/);
    await reader.cancel();
  } finally { await fx.close(); }
});

test("collector disconnects a viewer that cannot accept another event", async () => {
  const fx = await fixture({ simulateBackpressure: true });
  try {
    const cookie = fx.collector.viewerCookie().split(";")[0];
    const response = await fetch(fx.url + "/activity/stream", { headers: { Cookie: cookie } });
    const reader = response.body!.getReader();
    assert.equal((await post(fx.url, event())).status, 201);
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /Edited src\/main.ts/);
    const closed = await Promise.race([reader.read().then((chunk) => chunk.done), new Promise<false>((resolve) => setTimeout(() => resolve(false), 500))]);
    assert.equal(closed, true);
  } finally { await fx.close(); }
});
