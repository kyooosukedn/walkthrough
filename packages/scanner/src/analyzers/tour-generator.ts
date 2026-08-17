import type {
  CodeMap,
  TourDefinition,
  TourStep,
  FileTreeNode,
  EntryPoint,
  ImportGraph,
  ProjectInfo,
  Analyzer,
} from "../types.js";

export class TourGeneratorAnalyzer implements Analyzer {
  name = "tour-generator";

  detect(_project: ProjectInfo): boolean {
    return true;
  }

  async analyze(project: ProjectInfo): Promise<{ tour: TourDefinition }> {
    return { tour: generateTour(project) };
  }
}

function generateTour(project: ProjectInfo): TourDefinition {
  const steps: TourStep[] = [];
  const pkg = project.packageJson;
  const name = (pkg?.name as string) || "this project";
  const tree = project.fileTree;
  const topDirs = tree?.children?.filter((c) => c.type === "directory") ?? [];
  const topFiles = tree?.children?.filter((c) => c.type === "file") ?? [];

  // Step 1: Welcome
  steps.push({
    id: "welcome",
    title: `Welcome to ${name}`,
    description: `This is **${name}**. We'll walk you through the architecture step by step so you understand how everything fits together.`,
    focusNodeIds: [],
  });

  // Step 2: Project overview (top-level directories)
  if (topDirs.length > 0) {
    steps.push({
      id: "project-structure",
      title: "Project Structure",
      description: `The project has **${topDirs.length} main directories**: ${topDirs.map((d) => `\`${d.name}\``).join(", ")}. Each has a distinct role in the architecture.`,
      focusNodeIds: topDirs.map((d) => d.path),
    });
  }

  // Step 3: Entry points — map to top-level dirs that contain them
  const entryPoints: EntryPoint[] | undefined = (project as ProjectInfo & { _entryPoints?: EntryPoint[] })._entryPoints;
  if (entryPoints && entryPoints.length > 0) {
    const epDirs = new Set<string>();
    const epDescriptions: string[] = [];

    for (const ep of entryPoints) {
      const topDir = ep.file.split("/")[0];
      if (topDirs.find((d) => d.name === topDir)) {
        epDirs.add(topDir);
      }
      const route = ep.route ? ` (serves \`${ep.route}\`)` : "";
      epDescriptions.push(`**${ep.file}** — ${ep.type}${route}`);
    }

    steps.push({
      id: "entry-points",
      title: "Entry Points",
      description: `Key entry points in this codebase:\n\n${epDescriptions.slice(0, 5).join("\n")}${epDescriptions.length > 5 ? `\n...and ${epDescriptions.length - 5} more` : ""}`,
      focusNodeIds: [...epDirs],
    });
  }

  // Step 4: Source code deep dive — show subdirectories of src/ or packages/
  const srcLike = tree?.children?.find((c) => c.name === "src" || c.name === "lib" || c.name === "packages");
  if (srcLike && srcLike.children) {
    const subDirs = srcLike.children.filter((c) => c.type === "directory").slice(0, 6);
    if (subDirs.length > 0) {
      steps.push({
        id: "source-modules",
        title: "Source Modules",
        description: `Inside \`${srcLike.name}/\`, the code is organized into: ${subDirs.map((d) => `**${d.name}**`).join(", ")}. Each module handles a specific concern.`,
        focusNodeIds: subDirs.map((d) => d.path),
      });
    }
  }

  // Step 5: Configuration files
  const configFiles = topFiles.filter((c) =>
    c.name.includes("config") ||
    c.name === "package.json" ||
    c.name === "tsconfig.json" ||
    c.name === "tsconfig.base.json" ||
    c.name === ".env.example" ||
    c.name === "README.md"
  );

  if (configFiles.length > 0) {
    steps.push({
      id: "configuration",
      title: "Configuration",
      description: `These root-level files control the project's build, tooling, and documentation. Click any node to inspect it.`,
      focusNodeIds: configFiles.map((c) => c.path),
    });
  }

  // Step 6: Summary
  steps.push({
    id: "summary",
    title: "You Made It!",
    description: `That's the architecture of **${name}**! You now have a mental model of how the project is structured. Feel free to explore the graph freely — drag nodes, zoom in, click to inspect.`,
    focusNodeIds: topDirs.map((d) => d.path),
  });

  return { steps };
}
