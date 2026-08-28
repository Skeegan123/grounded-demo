# Domain docs

These rules tell engineering skills how to use this repository's domain documentation.

## Read before exploring

Read these when they exist:

- `CONTEXT.md` at the repository root.
- `docs/adr/` entries that affect the area you are about to change.

If a root `CONTEXT-MAP.md` is added later, read it and each linked `CONTEXT.md` relevant to the work. Also check `src/<context>/docs/adr/` for context-specific decisions.

Proceed silently when these files do not exist. The `/domain-modeling` skill creates them when the team resolves terms or architectural decisions.

## File structure

This repository uses the single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-another-decision.md
└── src/
```

## Use glossary terms

Use the terms defined in `CONTEXT.md` when naming domain concepts in issues, proposals, hypotheses, and tests. Do not substitute terms that the glossary explicitly avoids.

When a needed concept is missing, first check whether you are inventing language the project does not use. If the gap is real, note it for `/domain-modeling`.

## Flag ADR conflicts

Call out any proposal that contradicts an existing ADR. Name the ADR and explain why the decision may need reconsideration.
