export interface Citation { path: string; startLine: number; endLine: number }
export interface FileExplanation {
  title: string;
  sections: Array<{ heading: string; body: string; citations: Citation[] }>;
  nextFiles: Array<{ path: string; reason: string; line: number }>;
  exercise: string;
  unknowns: string[];
  sourcesUsed: string[];
}

export function FileExplanationPanel({ explanation, onOpenSource, onFollowNext }: {
  explanation: FileExplanation;
  onOpenSource: (path: string, line?: number) => void;
  onFollowNext: (path: string, line: number, reason: string) => void;
}) {
  return <aside className="explanation-panel" aria-label="AI file explanation">
    <h2>{explanation.title}</h2>
    <details className="sources-used"><summary>Sources inspected ({explanation.sourcesUsed.length})</summary><ul>{explanation.sourcesUsed.map((path) => <li key={path}>{path}</li>)}</ul></details>
    {explanation.sections.map((section, index) => <section key={index}>
      <h3>{section.heading}</h3>
      <p>{section.body}</p>
      {section.citations.length ? <div className="explanation-links">
        {section.citations.map((citation, citationIndex) => <button key={citationIndex} onClick={() => onOpenSource(citation.path, citation.startLine)}>
          {citation.path}:{citation.startLine}{citation.endLine !== citation.startLine ? `–${citation.endLine}` : ""}
        </button>)}
      </div> : <small>No source citation for this section; verify this claim in the code.</small>}
    </section>)}
    {explanation.nextFiles.length > 0 && <section><h3>Read next</h3>{explanation.nextFiles.map((file, index) => <p key={index}>
      <button onClick={() => onFollowNext(file.path, file.line, file.reason)}>{file.path}:{file.line}</button> — {file.reason}
    </p>)}</section>}
    <section><h3>Try it</h3><p>{explanation.exercise}</p></section>
    {explanation.unknowns.length > 0 && <section><h3>What this source cannot tell us</h3><ul>{explanation.unknowns.map((unknown, index) => <li key={index}>{unknown}</li>)}</ul></section>}
  </aside>;
}
