# First-call context tools under WebMCP

Research date: September 2, 2026

## Conclusion

A read-only `get_project_workspace` tool that returns app-owned context and usage guidance is not prohibited by the WebMCP draft or The WebMCP Challenge rules. The pattern is valid under today's API because a tool may return JSON-serializable data, and its natural-language description exists to help agents understand when and how to use it. The draft requires a non-empty description but does not ban workflow guidance in descriptions or results. Its security section is explicitly non-normative. [WebMCP draft, tool registration](https://webmachinelearning.github.io/webmcp/#dom-modelcontext-registertool), [WebMCP draft, `ModelContextTool`](https://webmachinelearning.github.io/webmcp/#model-context-tool), [WebMCP security and privacy considerations](https://webmachinelearning.github.io/webmcp/#security-privacy)

The WebMCP working group's open Skills proposal describes almost this exact workaround: use a normal tool description as a short summary, then return fuller instructions for combining other tools. The discussion says the pattern works, but WebMCP has no standard signal that identifies such a tool as a skill or tells a client to load it early. A client may never call it. This is an open design discussion, not part of the current specification. [WebMCP issue 161, "Skills: workflow-level context for tool composition"](https://github.com/webmachinelearning/webmcp/issues/161)

The scanner warning is still reasonable. The WebMCP draft classifies malicious instructions in tool metadata as tool poisoning and malicious instructions in results as output injection. OpenAI's browser documentation treats every website-provided tool definition and result as untrusted content, regardless of what the site claims. That is a client trust rule, not a ban on sites explaining their own features. [WebMCP prompt-injection analysis](https://webmachinelearning.github.io/webmcp/#prompt-injection), [OpenAI Site tools security and user controls](https://learn.chatgpt.com/docs/webmcp#security-and-user-controls)

The practical distinction is intent and authority. Context such as project identity, available capabilities, evidence rules, and local recovery advice helps the agent use the app. Text that claims system authority, overrides the user's request, requests unrelated data, grants itself permission, or directs cross-site actions is prompt injection.

## Challenge rules

The official rules require a working WebMCP-powered app that behaves as shown and a public implementation. They do not prohibit onboarding tools, context-returning tools, or workflow hints. Stage Two rewards thorough and skillful WebMCP use, a coherent product experience, user experience, and creativity. The rules also allow automated AI-driven analysis during judging, so avoiding injection-like wording still has practical value even when the design is legitimate. [The WebMCP Challenge official rules, sections 4 and 7](https://webmcp.devpost.com/rules)

The challenge's official Resources page links directly to Chrome's WebMCP security guide as guidance on prompt-injection risks and trust boundaries. It presents that guide as recommended documentation, not a separate pass/fail rule. [The WebMCP Challenge resources](https://webmcp.devpost.com/resources)

## Relevant implementation guidance

Chrome recommends descriptions that state what a tool does and when to use it. It also says to trust the agent instead of writing rigid instructions or expecting an exact sequence. A hard “always call this first” instruction is therefore not forbidden, but it cuts against the published best practice and may trigger client guardrails. [Chrome WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)

Chrome also recommends no more than 500 characters per tool description and 1,500 characters per individual output. These are current interoperability recommendations, not API limits. The same guide recommends `untrustedContentHint` for user-generated or externally sourced results. [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)

OpenAI recommends narrow inputs, accurate side-effect descriptions, enough output to verify the result, and normal application authentication, authorization, and validation. [OpenAI Site tools guide](https://learn.chatgpt.com/docs/webmcp#add-webmcp-to-your-website)

## Grounded's current position

Grounded registers `get_project_workspace` as read-only with a focused state-query description. Its result contains project identity and document count, the current Document Browsing selection, Assistance counts, the FIFO pending summary, and the latest completed summary. It omits the internal Demo Session ID, Professional Responses, and the complete document catalog. [`registerProjectWorkspaceTool.ts`](../../src/webmcp/registerProjectWorkspaceTool.ts)

Grounded's helper currently adds `untrustedContentHint: true` to every tool. That is conservative from the client's point of view. The WebMCP field itself has a narrower meaning: it says the output is untrusted from the registering author's point of view. Static guidance authored and controlled by Grounded is not untrusted in that narrower sense, while imported document text, user content, and external data are. OpenAI's browser may still treat all of it as untrusted site content. [`defineTool.ts`](../../src/webmcp/defineTool.ts), [WebMCP `ToolAnnotations`](https://webmachinelearning.github.io/webmcp/#dom-toolannotations-untrustedcontenthint)

## Implemented design

Keep `get_project_workspace` as a real context query, not a pseudo-system prompt.

- Describe its result rather than commanding an exact call order.
- Return structured, app-owned state under `project`, `documentBrowsing`, and `assistance`.
- Keep general tool instructions in `get_grounded_help`. The workspace result contains state only.
- Do not place `SYSTEM`, "ignore previous instructions," claims of higher authority, unrelated cross-site requests, or permission-granting language in metadata or results.
- Do not interpolate document text, user submissions, or external data into instruction fields. Keep such content in clearly named data fields with provenance and the untrusted hint.
- If a call truly must happen first for correctness, enforce the precondition in code and return a compact recovery error. Do not rely on prose to create a security or state boundary.
- Keep the result within Chrome's current 1,500-character recommendation and avoid duplicating every other tool description.
- Test several natural-language goals. The app should still work if the agent skips the orientation call, since current WebMCP has no guaranteed first-call or skill-loading mechanism.

Grounded now uses the workspace tool as a recovery query. After a reload or context loss, the request summary exposes a durable ID and lifecycle state that the External Agent can pass to `get_assistance_request`. The focused `get_grounded_help` entry explains that handoff without copying help text into the workspace result.
