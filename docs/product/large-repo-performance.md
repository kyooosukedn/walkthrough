# Large-repo scan performance

Measured on 9 October 2026 with the same local Medusa checkout on Windows. The checkout had 24,201 scanned files and 18,432 import edges. All runs used `scan(rootPath)` in a fresh Node process. Scanner elapsed time excludes CLI startup, JSON serialization, and browser rendering.

| Scanner branch | Elapsed | Heap at completion | RSS at completion |
| --- | ---: | ---: | ---: |
| `feat/teaching-notes` baseline | 113.8 s | 129 MB | 198 MB |
| `feat/fast-large-repos` run 1 | 55.6 s | 150 MB | 224 MB |
| `feat/fast-large-repos` run 2 | 47.9 s | 212 MB | 286 MB |

Both optimized runs and the baseline produced the same SHA-256 fingerprint after removing only `meta.scannedAt`: `c6c0e36c5753c8f613589acac5e7cd9be4f26f522b546b851b654999452149ff`. The serialized map was 15,115,846 bytes in all three runs. File, directory, line, entry-point, component, and edge counts also matched. That is stronger evidence of output preservation than counts alone, but it covers this checkout and scanner version, not every repository.

The optimized runs were roughly 2.0–2.4 times faster than the baseline run. The order was optimized, optimized, baseline, so filesystem cache and background load may affect the spread. The earlier CPU-profiled baseline took 136.2 seconds; profiler overhead makes it a separate observation.

## What changed

- Count line totals using 16 concurrent local file reads, with results returned in file order.
- Extract imports using the same bound, then fold edges in original file order.
- Index source-target edge pairs and node IDs with maps/sets instead of repeatedly searching growing arrays.

No dependency, cache, or language-specific behavior was added. Unreadable files still contribute a file node but no line/import content, as before.

## Remaining work

The map is still about 15 MB minified (27.5 MB pretty-printed in the earlier saved sample), and the CLI sends the full map to the browser. Browser parse/render time and first useful screen need separate measurement. The scanner still walks directories in multiple analyzers; reusing one file index may help, but should be measured after this slice. RSS rose from 198 MB in the baseline run to 224–286 MB in optimized runs, consistent with overlapping reads; watch this on lower-memory machines before raising the concurrency bound. No current measurement justifies rewriting the scanner in Rust.
