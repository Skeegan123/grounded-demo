import './App.css'

function App() {
  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Grounded home">
          <span className="wordmark-mark" aria-hidden="true" />
          Grounded
        </a>
        <span className="project-status">Early prototype</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Human judgment, where it matters</p>
        <h1 id="hero-title">
          A shared workspace for construction teams and AI agents.
        </h1>
        <p className="hero-copy">
          Grounded is an experiment in reviewing construction documents with
          AI. Agents handle the search, comparison, and paperwork. Experienced
          professionals answer the questions that demand real visual and
          spatial judgment.
        </p>
      </section>

      <section className="principle" aria-labelledby="principle-title">
        <p className="section-number">01</p>
        <div>
          <h2 id="principle-title">Assist the work. Do not fake certainty.</h2>
          <p>
            Construction drawings punish confident guesses. The goal is not
            full automation. It is a faster review process with a clear path
            for an agent to ask a person for precise, usable input.
          </p>
        </div>
      </section>

      <footer>
        <p>Built for the WebMCP Hackathon.</p>
      </footer>
    </main>
  )
}

export default App
