import { useEffect, useRef, useState } from "react";
import { FileExplanationPanel, type FileExplanation } from "../explain/FileExplanationPanel.js";
import type { Journey } from "../journey/state.js";

export function SourcePreview({ path, line, journey, cachedExplanation, onBack, onOpenSource, onFollowNext, onJump, onExplanation }: {
  path: string;
  line?: number;
  journey: Journey;
  cachedExplanation: FileExplanation | null;
  onBack: () => void;
  onOpenSource: (path: string, line?: number) => void;
  onFollowNext: (path: string, line: number, reason: string) => void;
  onJump: (index: number) => void;
  onExplanation: (path: string, explanation: FileExplanation) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<FileExplanation | null>(cachedExplanation);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const explainRequest = useRef<AbortController | null>(null);
  const activeStepButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeStepButton.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [journey.activeIndex, path]);

  useEffect(() => {
    explainRequest.current?.abort();
    setSource(null);
    setSourceError(null);
    setExplanation(cachedExplanation);
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
      onExplanation(path, result as FileExplanation);
    } catch (error) {
      if (!controller.signal.aborted) setExplainError(error instanceof Error ? error.message : "Could not explain this file.");
    } finally {
      if (!controller.signal.aborted) setExplaining(false);
    }
  }

  return <main className="source-preview">
    <header><button onClick={onBack}>← Repo overview</button><strong>{path}</strong></header>
    <nav className="learning-journey" aria-label="Learning journey">
      <div className="learning-journey-heading"><strong>Follow the code</strong><span>Step {journey.activeIndex + 1} of {journey.steps.length}</span></div>
      <ol>
        {journey.steps.map((step, index) => <li key={`${index}-${step.path}`}>
          <button type="button" ref={index === journey.activeIndex ? activeStepButton : undefined} onClick={() => onJump(index)} aria-current={index === journey.activeIndex ? "step" : undefined} title={step.path}>
            <span className="learning-journey-number">{index + 1}</span>
            <span className="learning-journey-label"><strong>{step.path}</strong><small>{step.reason ?? (index === 0 ? "Starting file" : "Source file")}</small></span>
          </button>
        </li>)}
      </ol>
    </nav>
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
        {explanation && <FileExplanationPanel explanation={explanation} onOpenSource={onOpenSource} onFollowNext={onFollowNext} />}
      </div>}
    </div>
  </main>;
}
