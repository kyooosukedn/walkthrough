import { useEffect, useRef, useState } from "react";
import { FileExplanationPanel, type FileExplanation } from "../explain/FileExplanationPanel.js";

export function SourcePreview({ path, line, onBack, onOpenSource }: {
  path: string;
  line?: number;
  onBack: () => void;
  onOpenSource: (path: string, line?: number) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<FileExplanation | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const explainRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    explainRequest.current?.abort();
    setSource(null);
    setSourceError(null);
    setExplanation(null);
    setExplainError(null);
    setExplaining(false);
    const controller = new AbortController();
    fetch(`/source?path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.text();
        if (!response.ok || !response.headers.get("content-type")?.includes("text/plain")) throw new Error(response.ok ? "Source preview needs the Walkthrough CLI server." : body);
        setSource(body);
      })
      .catch((error) => { if (error.name !== "AbortError") setSourceError(error.message); });
    return () => { controller.abort(); explainRequest.current?.abort(); };
  }, [path]);

  useEffect(() => {
    if (!source || !line) return;
    const target = document.getElementById(`source-line-${line}`);
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [source, line, path]);

  async function explain() {
    const controller = new AbortController();
    explainRequest.current = controller;
    setExplaining(true);
    setExplainError(null);
    setExplanation(null);
    try {
      const response = await fetch("/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not explain this file.");
      setExplanation(result as FileExplanation);
    } catch (error) {
      if (!controller.signal.aborted) setExplainError(error instanceof Error ? error.message : "Could not explain this file.");
    } finally {
      if (!controller.signal.aborted) setExplaining(false);
    }
  }

  return <main className="source-preview">
    <header><button onClick={onBack}>← Repo overview</button><strong>{path}</strong></header>
    <div className="source-actions">
      <button onClick={() => void explain()} disabled={explaining || source === null || !!sourceError}>{explaining ? "Explaining…" : "Explain this file"}</button>
      <span>Clicking sends selected source snippets to your configured AI provider. Previewing alone does not.</span>
    </div>
    {!/\.(?:[cm]?js|[cm]?ts|jsx|tsx)$/i.test(path) && <p className="source-context-note">Walkthrough has no import relationship analysis for this file type. The explanation can use this file, a matching test, and nearby project documentation when available.</p>}
    <div className="source-columns">
      <section className="source-code" aria-label="Source code">
        {sourceError ? <p role="alert">{sourceError}</p> : source === null ? <p>Loading source…</p> : <pre><code>{source.split(/\r?\n/).map((content, index) => <span className="source-line" id={`source-line-${index + 1}`} tabIndex={-1} key={index}><span className="source-line-number" aria-hidden="true">{index + 1}</span>{content || " "}</span>)}</code></pre>}
      </section>
      {(explaining || explainError || explanation) && <div className="source-explanation" aria-live="polite">
        {explaining && <p>Reading this file and its nearby evidence…</p>}
        {explainError && <p role="alert">{explainError}</p>}
        {explanation && <FileExplanationPanel explanation={explanation} onOpenSource={onOpenSource} />}
      </div>}
    </div>
  </main>;
}
