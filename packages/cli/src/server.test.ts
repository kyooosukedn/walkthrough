// End-to-end checks against the built CLI (run `npm run build` first).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "node:http";

const CLI = resolve("dist/index.js");
const PORT = 40000 + Math.floor(Math.random() * 20000);
let project = "";
let server: ChildProcess;

function get(path: string, host = `127.0.0.1:${PORT}`): Promise<{ status: number; body: string }> {
  return new Promise((ok, fail) => {
    const req = request({ host: "127.0.0.1", port: PORT, path, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => ok({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", fail);
    req.end();
  });
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      await get("/codemap.json");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start");
}

before(async () => {
  assert.ok(existsSync(CLI), "build the CLI before running this test");
  project = await mkdtemp(join(tmpdir(), "walkthrough-e2e-"));
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo", main: "index.js" }));
  await writeFile(join(project, "index.js"), 'const lib = require("./lib");\n');
  await writeFile(join(project, "lib.js"), "module.exports = 1;\n");
  await writeFile(join(project, ".env"), "API_KEY=secret\n");
  server = spawn(process.execPath, [CLI, project, "--port", String(PORT), "--no-open"], { stdio: "ignore" });
  await waitForServer();
});

after(async () => {
  server?.kill();
  await rm(project, { recursive: true, force: true });
});

test("--json writes valid JSON to stdout and nothing into the project", () => {
  const out = spawnSync(process.execPath, [CLI, project, "--json"], { encoding: "utf8" });
  assert.equal(out.status, 0);
  assert.equal(JSON.parse(out.stdout).meta.name, "demo");
  assert.ok(!existsSync(join(project, "codemap.json")));
});

test("serves the codemap, including with a query string", async () => {
  const res = await get("/codemap.json?t=1");
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).meta.name, "demo");
});

test("blocks path traversal out of the visualizer folder", async () => {
  for (const path of [
    "/" + "../".repeat(20) + "etc/hosts",
    "/" + "%2e%2e/".repeat(20) + "etc/hosts",
    // Encoded slashes survive URL normalization and only become ".." after decoding
    "/" + "..%2f".repeat(20) + "etc%2fhosts",
  ]) {
    const res = await get(path);
    assert.ok(!res.body.includes("localhost"), `traversal leaked via ${path}`);
  }
});

test("rejects requests for a foreign Host (DNS rebinding)", async () => {
  const res = await get("/source?path=index.js", "evil.example");
  assert.equal(res.status, 403);
});

test("source preview reads project files but not outside them", async () => {
  assert.equal((await get("/source?path=index.js")).status, 200);
  assert.notEqual((await get("/source?path=../../../../etc/hosts")).status, 200);
});

test("source preview never shows .env files", async () => {
  const res = await get("/source?path=.env");
  assert.equal(res.status, 403);
  assert.ok(!res.body.includes("API_KEY"));
});

test("rejects an invalid port", () => {
  const out = spawnSync(process.execPath, [CLI, project, "--port", "abc"], { encoding: "utf8" });
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /Invalid port/);
});
