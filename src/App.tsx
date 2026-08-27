import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const TOOL_NAME = 'ask_construction_professional'

type RegistrationStatus = 'checking' | 'ready' | 'unsupported' | 'error'

interface RequestView {
  id: number
  question: string
}

interface ActiveRequest extends RequestView {
  resolve: (answer: string) => void
  reject: (reason: unknown) => void
  signal?: AbortSignal
  onAbort?: () => void
}

interface Exchange {
  question: string
  answer: string
}

function getQuestion(input: Record<string, unknown>) {
  const question = input.question

  if (typeof question !== 'string' || question.trim().length === 0) {
    return 'What should the agent know?'
  }

  return question.trim()
}

function getAnswerFromResult(result: string) {
  try {
    const parsed: unknown = JSON.parse(result)

    if (typeof parsed === 'object' && parsed && 'answer' in parsed) {
      return String(parsed.answer)
    }
  } catch {
    return result
  }

  return result
}

function App() {
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationStatus>(() =>
      document.modelContext ? 'checking' : 'unsupported',
    )
  const [registrationError, setRegistrationError] = useState('')
  const [request, setRequest] = useState<RequestView | null>(null)
  const [draft, setDraft] = useState('')
  const [lastExchange, setLastExchange] = useState<Exchange | null>(null)
  const [testState, setTestState] = useState<'idle' | 'waiting' | 'done'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const activeRequest = useRef<ActiveRequest | null>(null)
  const nextRequestId = useRef(0)

  const clearActiveRequest = useCallback(() => {
    const active = activeRequest.current

    if (active?.signal && active.onAbort) {
      active.signal.removeEventListener('abort', active.onAbort)
    }

    activeRequest.current = null
    setRequest(null)
    setDraft('')

    return active
  }, [])

  const askHuman = useCallback(
    (question: string, signal?: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        if (activeRequest.current) {
          reject(new Error('A human response is already pending.'))
          return
        }

        if (signal?.aborted) {
          reject(signal.reason ?? new DOMException('Tool call cancelled.', 'AbortError'))
          return
        }

        const id = ++nextRequestId.current
        const onAbort = () => {
          if (activeRequest.current?.id !== id) return

          const active = clearActiveRequest()
          active?.reject(
            signal?.reason ?? new DOMException('Tool call cancelled.', 'AbortError'),
          )
        }

        const active: ActiveRequest = {
          id,
          question,
          resolve,
          reject,
          signal,
          onAbort,
        }

        activeRequest.current = active
        signal?.addEventListener('abort', onAbort, { once: true })
        setRequest({ id, question })
      }),
    [clearActiveRequest],
  )

  const submitResponse = useCallback(() => {
    const answer = draft.trim()
    if (!answer) return

    const active = clearActiveRequest()
    active?.resolve(answer)
  }, [clearActiveRequest, draft])

  const dismissRequest = useCallback(() => {
    const active = clearActiveRequest()
    active?.reject(new DOMException('Human dismissed the request.', 'AbortError'))
  }, [clearActiveRequest])

  useEffect(() => {
    const modelContext = document.modelContext

    if (!modelContext) return

    const controller = new AbortController()
    let mounted = true

    const tool: WebMCPTool = {
      name: TOOL_NAME,
      title: 'Ask a construction professional',
      description:
        'Ask the construction professional viewing this page a question when human judgment is needed. The call remains pending until the person responds.',
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The specific question the construction professional should answer.',
          },
        },
        required: ['question'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: true,
      },
      execute: async (input, context) => {
        const question = getQuestion(input)
        const answer = await askHuman(question, context?.signal)
        setLastExchange({ question, answer })
        return { answer }
      },
    }

    modelContext
      .registerTool(tool, { signal: controller.signal })
      .then(() => {
        if (mounted) setRegistrationStatus('ready')
      })
      .catch((error: unknown) => {
        if (!mounted || controller.signal.aborted) return

        setRegistrationStatus('error')
        setRegistrationError(
          error instanceof Error ? error.message : 'Tool registration failed.',
        )
      })

    return () => {
      mounted = false
      controller.abort()
    }
  }, [askHuman])

  useEffect(
    () => () => {
      const active = activeRequest.current
      activeRequest.current = null
      active?.reject(new DOMException('Page closed.', 'AbortError'))
    },
    [],
  )

  const runTestCall = async () => {
    const modelContext = document.modelContext
    if (!modelContext) return

    setTestState('waiting')
    setTestMessage('The tool promise is pending.')

    try {
      const tools = await modelContext.getTools()
      const tool = tools.find(({ name }) => name === TOOL_NAME)

      if (!tool) throw new Error('The test tool is not registered.')

      const result = await modelContext.executeTool(
        tool,
        {
          question: 'What is one detail on the drawing that the agent should verify?',
        },
      )

      setTestState('done')
      setTestMessage(`Resolved with: ${getAnswerFromResult(result)}`)
    } catch (error) {
      setTestState('done')
      setTestMessage(error instanceof Error ? error.message : 'The test call failed.')
    }
  }

  const statusCopy = {
    checking: 'Checking browser support',
    ready: 'Tool registered',
    unsupported: 'WebMCP is not enabled',
    error: 'Registration failed',
  }[registrationStatus]

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Grounded home">
          <span className="wordmark-mark" aria-hidden="true" />
          Grounded
        </a>
        <span className={`project-status status-${registrationStatus}`}>
          <span className="status-dot" aria-hidden="true" />
          {statusCopy}
        </span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">WebMCP experiment 001</p>
        <h1 id="hero-title">Ask a person. Wait for a real answer.</h1>
        <p className="hero-copy">
          An agent can call this page's WebMCP tool when it needs human
          judgment. The tool opens a response box and its promise stays pending
          until you send an answer.
        </p>
      </section>

      <section className="tool-panel" aria-labelledby="tool-title">
        <div className="tool-heading">
          <p className="section-number">Registered tool</p>
          <code>{TOOL_NAME}</code>
        </div>
        <div className="tool-details">
          <h2 id="tool-title">Promise handshake</h2>
          <p>
            The agent supplies a question. Grounded returns a promise, asks you
            for an answer, and resolves the call with your exact response.
          </p>

          {registrationStatus === 'unsupported' && (
            <p className="browser-note" role="status">
              Enable <code>chrome://flags/#enable-webmcp-testing</code> in Chrome,
              then relaunch the browser.
            </p>
          )}

          {registrationStatus === 'error' && (
            <p className="browser-note error-note" role="alert">
              {registrationError}
            </p>
          )}

          <div className="test-row">
            <button
              className="primary-button"
              type="button"
              onClick={runTestCall}
              disabled={registrationStatus !== 'ready' || testState === 'waiting'}
            >
              {testState === 'waiting' ? 'Waiting for you...' : 'Run test tool'}
            </button>
            {testMessage && <p className="test-message">{testMessage}</p>}
          </div>
        </div>
      </section>

      {lastExchange && (
        <section className="last-exchange" aria-labelledby="last-response-title">
          <p className="section-number">Last response</p>
          <div>
            <h2 id="last-response-title">{lastExchange.question}</h2>
            <blockquote>{lastExchange.answer}</blockquote>
          </div>
        </section>
      )}

      <footer>
        <p>Built for the WebMCP Hackathon.</p>
      </footer>

      {request && (
        <div className="dialog-backdrop">
          <section
            className="response-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="response-dialog-title"
            aria-describedby="agent-question"
          >
            <p className="dialog-kicker">The agent needs your help</p>
            <h2 id="response-dialog-title">Answer one question</h2>
            <p id="agent-question" className="agent-question">
              {request.question}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submitResponse()
              }}
            >
              <label htmlFor="human-response">Your response</label>
              <textarea
                id="human-response"
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type what the agent should know..."
                rows={5}
              />
              <div className="dialog-actions">
                <button className="text-button" type="button" onClick={dismissRequest}>
                  Dismiss
                </button>
                <button className="primary-button" type="submit" disabled={!draft.trim()}>
                  Send to agent
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
