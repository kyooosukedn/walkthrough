# How Walkthrough works (plain English)

## The whole thing in 30 seconds

```text
  you run:  walkthrough ./some-project
                 │
   1. SCANNER    reads the project's files (never runs them)
                 and writes down what it finds as one JSON file
                 │
   2. CLI        starts a tiny web server on your own machine
                 and opens the browser
                 │
   3. VISUALIZER a web page that reads that JSON and draws
                 the map + the guided tour
```

That's it. Three parts, and they only talk through the JSON ("codemap").
The scanner never knows a browser exists; the browser never reads your disk.

## Part 1 — the scanner (`packages/scanner/src/`)

It answers four questions about any project:

| Question | File that answers it |
|---|---|
| What files and folders are there? | `analyzers/file-tree.ts` |
| Which file uses which? (imports) | `analyzers/imports.ts` (JS/TS), `analyzers/lang-imports.ts` (Python, Go) |
| Where does the program start? | `analyzers/entry-points.ts` — also ranks them so tests/examples never come first |
| Is it a monorepo? Which packages? | `analyzers/workspaces.ts` |

Then it adds extras when it recognizes a framework:

| Extra | File |
|---|---|
| Web routes (Next.js, Express) | `analyzers/nextjs-routes.ts`, `analyzers/express-routes.ts` |
| React components | `analyzers/react-components.ts` |
| Database tables (Prisma, SQL) | `analyzers/database.ts` |
| Docs / tests / source landmarks | `analyzers/orientation.ts` |

Finally it writes the tour — a list of steps with text and which boxes to highlight:
`analyzers/tour-generator.ts`. Each step answers one question a newcomer has:
*what's here → where does it start → how is the code split → how do the parts connect → what's the config.*

`scanner.ts` runs all of the above in order. `types.ts` describes the JSON shape.

## Part 2 — the CLI (`packages/cli/src/`)

- `index.ts` — reads your command, runs the scanner, serves the web page on `127.0.0.1` only.
- `source.ts` — lets the page show a file's text, but only files inside the scanned project.

Safety rules live here: no access from other machines, no reading outside the project,
no requests from other websites. `server.test.ts` checks each rule.

## Part 3 — the visualizer (`packages/visualizer/src/`)

A normal React web app.

- `App.tsx` — picks the screen: welcome, map, or file preview.
- `ui/WelcomeScreen.tsx` — the first screen (start-here files, landmarks, search).
- `views/` — the maps: overview, routes, components, database.
- `tour/` — the guided tour: `TourEngine.ts` decides which step you're on,
  `useTourTransitions.ts` moves the camera, `NarrationPanel.tsx` shows the text.

## Try it

```bash
npm ci && npm run build && npm test
node packages/cli/dist/index.js .        # Walkthrough explains itself
```

## Deliberate limits

- It reads code with simple pattern matching, not a full compiler — fast and dependency-free,
  occasionally misses an unusual import. The map is a map, not a proof.
- Speed is not the bottleneck: ~25k files scan in about 4 seconds.
