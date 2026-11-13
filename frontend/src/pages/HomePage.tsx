export function HomePage() {
  return (
    <main id="contenu" className="welcome relative flex flex-1 items-center" tabIndex={-1}>
      <div className="welcome-content relative z-10 w-full">
        <div className="welcome-rule" aria-hidden="true" />
        <h1>Bienvenue<span className="welcome-period">.</span></h1>
      </div>
      <div className="welcome-frame" aria-hidden="true">
        <span />
      </div>
    </main>
  )
}
