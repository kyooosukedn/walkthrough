import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExplainHandler } from "./handler.js";

type Provider = Parameters<typeof createExplainHandler>[0]["provider"];

async function withEndpoint(provider: Provider, run: (url: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "walkthrough-explain-"));
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "main.py"), "def run():\n    return 1\n");
  await writeFile(join(root, ".env"), "API_KEY=secret\n");
  await writeFile(join(root, ".npmrc"), "//registry.npmjs.org/:_authToken=secret\n");
  await writeFile(join(root, ".envrc"), "export TOKEN=secret\n");
  const server: Server = createServer(createExplainHandler({
    rootPath: root,
    allowedPaths: new Set(["src/main.py", ".env", ".npmrc", ".envrc"]),
    imports: undefined,
    provider,
  }));
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

function request(url: string, path = "src/main.py", headers: Record<string, string> = {}) {
  return fetch(`${url}/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ path }),
  });
}

function explanation() {
  return {
    title: "How main.py runs",
    sections: [{ heading: "Purpose", body: "run returns one.", citations: [{ path: "src/main.py", startLine: 1, endLine: 2 }] }],
    nextFiles: [{ path: "src/main.py", reason: "Inspect the function", line: 1 }],
    exercise: "Change the return value and predict the result.",
    unknowns: ["No runtime call site was inspected."],
  };
}

test("explain endpoint sends selected source to provider only after valid POST", async () => {
  let calls = 0;
  const provider = { async explain(evidence: { selectedPath: string; files: Array<{ path: string }> }) {
    calls++;
    assert.equal(evidence.selectedPath, "src/main.py");
    assert.deepEqual(evidence.files.map((file) => file.path), ["src/main.py"]);
    return explanation();
  } };
  await withEndpoint(provider, async (url) => {
    const response = await request(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...explanation(), sourcesUsed: ["src/main.py"] });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(calls, 1);
  });
});

test("missing provider returns setup error without reading or sending source", async () => {
  await withEndpoint(undefined, async (url) => {
    const response = await request(url);
    assert.equal(response.status, 503);
    assert.match(await response.text(), /configure|available/i);
  });
});

test("non-JSON, malformed, and oversized bodies never reach provider", async () => {
  let calls = 0;
  await withEndpoint({ async explain() { calls++; return explanation(); } }, async (url) => {
    const plain = await fetch(`${url}/explain`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "src/main.py" });
    assert.equal(plain.status, 415);
    const malformed = await fetch(`${url}/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal(malformed.status, 400);
    const oversized = await fetch(`${url}/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: "a".repeat(5000) }) });
    assert.equal(oversized.status, 413);
    assert.equal(calls, 0);
  });
});

test("foreign browser origin and secret path cannot trigger AI", async () => {
  let calls = 0;
  await withEndpoint({ async explain() { calls++; return explanation(); } }, async (url) => {
    const foreign = await request(url, "src/main.py", { Origin: "https://example.com" });
    assert.equal(foreign.status, 403);
    const secret = await request(url, ".env");
    assert.equal(secret.status, 403);
    assert.equal((await request(url, ".npmrc")).status, 403);
    assert.equal((await request(url, ".envrc")).status, 403);
    assert.equal(calls, 0);
  });
});

test("overlapping request bodies cannot start two provider calls", async () => {
  let calls = 0;
  let providerStarted!: () => void;
  const started = new Promise<void>((resolve) => { providerStarted = resolve; });
  await withEndpoint({ async explain() { calls++; providerStarted(); await new Promise((resolve) => setTimeout(resolve, 100)); return explanation(); } }, async (url) => {
    const target = new URL(`${url}/explain`);
    const payload = JSON.stringify({ path: "src/main.py" });
    const firstResponse = new Promise<{ status: number }>((resolve, reject) => {
      const first = httpRequest(target, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode ?? 0 }));
      });
      first.on("error", reject);
      first.write(payload.slice(0, 5));
      setTimeout(async () => {
        try {
          const second = request(url);
          await started;
          first.end(payload.slice(5));
          assert.equal((await second).status, 200);
        } catch (error) { first.destroy(); reject(error); }
      }, 15);
    });
    assert.equal((await firstResponse).status, 429);
    assert.equal(calls, 1);
  });
});

test("provider errors do not leak prompt or key-like details", async () => {
  await withEndpoint({ async explain() { throw new Error("API_KEY=very-secret prompt=source"); } }, async (url) => {
    const response = await request(url);
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, /very-secret|prompt=source/);
  });
});

test("fabricated citation paths and line numbers are removed", async () => {
  const bad = explanation();
  bad.sections[0].citations.push({ path: ".env", startLine: 1, endLine: 1 });
  bad.sections[0].citations.push({ path: "src/main.py", startLine: 999, endLine: 999 });
  bad.nextFiles.push({ path: ".env", reason: "fake", line: 1 });
  await withEndpoint({ async explain() { return bad; } }, async (url) => {
    const response = await request(url);
    assert.equal(response.status, 200);
    const body = await response.json() as ReturnType<typeof explanation>;
    assert.deepEqual(body.sections[0].citations, [{ path: "src/main.py", startLine: 1, endLine: 2 }]);
    assert.deepEqual(body.nextFiles, [{ path: "src/main.py", reason: "Inspect the function", line: 1 }]);
  });
});

test("missing model section headings receive neutral labels without losing cited content", async () => {
  const response = explanation() as ReturnType<typeof explanation>;
  delete (response.sections[0] as { heading?: string }).heading;
  await withEndpoint({ async explain() { return response as ReturnType<typeof explanation>; } }, async (url) => {
    const result = await request(url);
    assert.equal(result.status, 200);
    const body = await result.json() as ReturnType<typeof explanation>;
    assert.equal(body.sections[0].heading, "Finding 1");
    assert.equal(body.sections[0].body, "run returns one.");
    assert.equal(body.sections[0].citations[0].path, "src/main.py");
  });
});
