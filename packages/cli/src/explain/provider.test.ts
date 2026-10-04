import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeepSeekProviderFromEnv } from "./provider.js";

const evidence = {
  selectedPath: "src/main.py",
  files: [{ path: "src/main.py", content: "def run():\n    return 1\n", lineCount: 3, truncated: false }],
};

const explanation = {
  title: "main.py",
  sections: [{ heading: "Purpose", body: "Returns one.", citations: [{ path: "src/main.py", startLine: 1, endLine: 2 }] }],
  nextFiles: [],
  exercise: "Change the return value.",
  unknowns: ["No caller was supplied."],
};

test("only a DeepSeek key enables provider; Anthropic configuration is ignored", () => {
  const fakeFetch = async () => { throw new Error("should not call"); };
  assert.equal(createDeepSeekProviderFromEnv({ ANTHROPIC_API_KEY: "old-key", ANTHROPIC_DEFAULT_SONNET_MODEL: "sonnet" }, fakeFetch), undefined);
  assert.ok(createDeepSeekProviderFromEnv({ DEEPSEEK_API_KEY: "deepseek-key" }, fakeFetch));
});

test("provider sends bounded JSON request to DeepSeek and parses structured answer", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer deepseek-key");
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.ok(body.max_tokens > 0 && body.max_tokens <= 3000);
    assert.match(body.messages[0].content, /define unfamiliar terms/i);
    assert.match(body.messages[0].content, /predict/i);
    assert.match(body.messages[0].content, /cite exact supplied file paths and line ranges/i);
    assert.match(body.messages[1].content, /src\/main\.py/);
    assert.match(body.messages[1].content, /1: def run/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(explanation) } }] }), { status: 200 });
  };
  const provider = createDeepSeekProviderFromEnv({ DEEPSEEK_API_KEY: "deepseek-key" }, fakeFetch);
  assert.ok(provider);
  assert.deepEqual(await provider.explain(evidence), explanation);
  assert.equal(calls, 1);
});

test("DeepSeek API failures and invalid JSON do not expose response details", async () => {
  const failure = createDeepSeekProviderFromEnv({ DEEPSEEK_API_KEY: "deepseek-key" }, async () => new Response("secret prompt echo", { status: 401 }));
  assert.ok(failure);
  await assert.rejects(failure.explain(evidence), { message: "DeepSeek request failed." });

  const malformed = createDeepSeekProviderFromEnv({ DEEPSEEK_API_KEY: "deepseek-key" }, async () => new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), { status: 200 }));
  assert.ok(malformed);
  await assert.rejects(malformed.explain(evidence), { message: "DeepSeek returned an invalid explanation." });
});
