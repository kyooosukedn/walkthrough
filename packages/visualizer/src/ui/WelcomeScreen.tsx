import { useMemo, useState } from "react";
import { Compass, FileCode2, Play, Search } from "lucide-react";
import type { CodeMap, FileTreeNode } from "../types.js";

interface WelcomeScreenProps {
  data: CodeMap;
  onStartTour: () => void;
  onExplore: () => void;
  onOpenSource: (path: string) => void;
  hasTour: boolean;
}

function allFiles(tree: FileTreeNode): string[] {
  if (tree.type === "file") return [tree.path];
  return (tree.children ?? []).flatMap(allFiles);
}

export function WelcomeScreen({ data, onStartTour, onExplore, onOpenSource, hasTour }: WelcomeScreenProps) {
  const [query, setQuery] = useState("");
  const files = useMemo(() => allFiles(data.fileTree), [data.fileTree]);
  const fileSet = useMemo(() => new Set(files), [files]);
  const orientation = data.orientation ?? { docs: [], manifests: [], tests: [], sourceRoots: [] };
  const suggestions = useMemo(() => {
    const paths = [...(data.routes ?? []).map((route) => route.file), ...(data.entryPoints ?? []).map((entry) => entry.file)];
    return [...new Set(paths)].filter((path) => fileSet.has(path)).slice(0, 6);
  }, [data.routes, data.entryPoints, fileSet]);
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return files.filter((path) => path.toLowerCase().includes(needle)).slice(0, 20);
  }, [files, query]);
  const knownRoots = orientation.sourceRoots.filter((path) => path === "." || data.fileTree.children?.some((node) => node.path === path));

  return (
    <main className="onramp">
      <div className="onramp-inner">
        <header className="onramp-header">
          <div className="onramp-kicker">◆ WALKTHROUGH · REPO START</div>
          <h1>Find your way through {data.meta.name}</h1>
          <p>Start with real files. Choose a path when you know what you want to learn.</p>
          <div className="onramp-meta">
            <span>{data.meta.stats.files} files</span>
            <span>{data.meta.language === "unknown" ? "Language not identified" : data.meta.language}</span>
            <span>{data.meta.frameworks.map((f) => f.name).join(", ") || "No framework identified"}</span>
          </div>
        </header>

        <section className="onramp-coverage" aria-label="Analysis coverage">
          <strong>What we can show</strong>
          <span>Structure: file tree and likely starting files</span>
          <span>Workflow trace: {data.routes?.length ? "some static route links available" : "not available for this repo yet"}</span>
          <small>Suggestions come from filenames and supported analyzers. They are starting points, not a verified runtime call graph.</small>
        </section>

        <section className="onramp-search" aria-label="Find a file">
          <label htmlFor="file-search"><Search size={18} /> Find a file by name or path</label>
          <input id="file-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try routes, main.py, tests…" />
          {query.trim() && <div className="onramp-results" aria-live="polite">
            {searchResults.length ? searchResults.map((path) => <button key={path} onClick={() => onOpenSource(path)}>{path}</button>) : <p>No scanned file matches. Try another name.</p>}
            {searchResults.length === 20 && <small>Showing first 20 matches. Narrow your search for more.</small>}
          </div>}
        </section>

        <div className="onramp-grid">
          <section className="onramp-card">
            <h2>Start here</h2>
            <p>Likely entry files found in this checkout.</p>
            {suggestions.length ? suggestions.map((path) => <button className="onramp-path" key={path} onClick={() => onOpenSource(path)}><FileCode2 size={16} />{path}</button>) : <p className="onramp-empty">No trustworthy entry file detected. Use search or inspect source roots below.</p>}
          </section>
          <section className="onramp-card">
            <h2>Repo landmarks</h2>
            <PathGroup title="Docs" paths={orientation.docs.filter((path) => fileSet.has(path))} onOpenSource={onOpenSource} />
            <PathGroup title="Manifests" paths={orientation.manifests.filter((path) => fileSet.has(path))} onOpenSource={onOpenSource} />
            <PathGroup title="Tests" paths={orientation.tests.filter((path) => fileSet.has(path))} onOpenSource={onOpenSource} />
            <div className="onramp-group"><strong>Source roots</strong><span>{knownRoots.length ? knownRoots.join(" · ") : "No conventional source directory found"}</span></div>
          </section>
        </div>

        <div className="onramp-actions">
          {hasTour && <button onClick={onStartTour}><Play size={16} /> View architecture tour</button>}
          <button onClick={onExplore}><Compass size={16} /> Explore map</button>
        </div>
      </div>
    </main>
  );
}

function PathGroup({ title, paths, onOpenSource }: { title: string; paths: string[]; onOpenSource: (path: string) => void }) {
  return <div className="onramp-group"><strong>{title}</strong>{paths.length ? paths.slice(0, 4).map((path) => <button key={path} onClick={() => onOpenSource(path)}>{path}</button>) : <span>None found</span>}</div>;
}
