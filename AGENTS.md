# Working in the public Grounded demo

Read `CONTEXT.md` before changing domain language. Review the decisions under
`docs/adr/` before changing document navigation behavior.

Use pnpm 10.26.0 with Node.js 22 or later. Before submitting a change, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm bundle:check
```

Do not edit files under `src/documents/generated/` by hand. Regenerate prepared
Document Evidence with the importer documented in
`docs/document-evidence-import.md`.
