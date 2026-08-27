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

This repository contains the starting web application and one WebMCP experiment:

- Vite
- React
- TypeScript
- Oxlint
- An imperative `ask_construction_professional` WebMCP tool

There is no backend, document viewer, markup system, or persistence yet. Those
choices are intentionally still open.

## Test the WebMCP promise flow

The `ask_construction_professional` tool receives a question from an agent. Its
`execute` callback opens an in-page response dialog and returns a promise that
stays pending until the person submits an answer. The resolved tool result is:

```json
{
  "answer": "The person's response"
}
```

For local testing in Chrome:

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Enable the WebMCP testing flag and relaunch Chrome.
3. Run `pnpm dev` and open the URL printed by Vite.
4. Click **Run test tool**, or call the tool with a WebMCP-capable agent.

The page reports whether the browser accepted the registration. Dismissing the
dialog or cancelling the agent call rejects the pending promise instead of
returning an empty answer.

## Run locally

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by Vite.

## Checks

```bash
pnpm lint
pnpm build
```
