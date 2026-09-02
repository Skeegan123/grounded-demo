# Performance baselines

These deadline-scoped baselines measure the production build. They are not
substitutes for WebMCP functional tests.

## Entry bundle

Build and check the production entry with:

```bash
pnpm build
pnpm bundle:check
```

The checker reads `dist/.vite/manifest.json`, selects its single JavaScript
entry by `isEntry`, and measures that file rather than guessing its hashed
name. It fails above either budget.

| Measurement | Before OCR removal | September 2, 2026 baseline | Budget |
| --- | ---: | ---: | ---: |
| Raw | 1,759,071 bytes | 671,887 bytes | 756,000 bytes |
| gzip | 343,680 bytes | 172,530 bytes | 195,000 bytes |

The budgets leave 12.5% raw and 13.0% gzip headroom over the baseline. This is
enough to ignore small bundler variation while catching a significant entry
regression.

## Lighthouse

Run the complete production-preview workflow with:

```bash
pnpm lighthouse:baseline
```

The command builds the application, serves `dist/` with `vite preview` at
`http://127.0.0.1:4173`, waits for an HTTP 200 response, and runs the desktop
Lighthouse preset. HTML and JSON reports are written under
`artifacts/lighthouse/` and ignored by Git.

The September 2, 2026 single-run baseline was captured on macOS 26.4 with
Google Chrome 152.0.7977.65, Lighthouse 13.4.1, Node.js 24.19.0, and a
Lighthouse benchmark index of 4451.5.

| Category | Score |
| --- | ---: |
| Performance | 78 |
| Accessibility | 96 |
| Best practices | 96 |
| SEO | 91 |

This local result is recorded for comparison only. Lighthouse scores are noisy,
so the workflow does not gate on them.
