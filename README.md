# Grounded

Grounded is an early WebMCP Hackathon project exploring how AI agents and
construction professionals can review construction documents together.

Construction drawings demand exact counts, measurements, and spatial judgment.
An agent can gather files, extract text, compare requirements, and organize the
result. When a question depends on reading the drawing correctly, Grounded will
give the agent a direct way to ask an experienced person and receive structured,
usable input.

The goal is a faster, more reliable review process, not full automation.

## Current status

This repository contains only the starting web application:

- Vite
- React
- TypeScript
- Oxlint

There is no backend, document viewer, markup system, agent integration, or
persistence yet. Those choices are intentionally still open.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Checks

```bash
npm run lint
npm run build
```
