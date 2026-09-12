import { Authenticated, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export const REPO_URL = "https://github.com/sneg55/zabuton";

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <header className="topbar">
        <Link to="/" className="wordmark">
          Zabuton <small>boards and commissions, kept current</small>
        </Link>
        <nav className="topnav">
          <Link to="/c/dublin-ca">Example city</Link>
          <Unauthenticated>
            <Link to="/clerk" className="btn btn-secondary btn-sm">Clerk sign in</Link>
          </Unauthenticated>
          <Authenticated>
            <Link to="/clerk" className="btn btn-secondary btn-sm">Open clerk desk</Link>
          </Authenticated>
        </nav>
      </header>
      {children}
      <footer className="footer">
        <span>
          Zabuton reads the city's own website and keeps the roster honest. Built on <a href="https://convex.dev" target="_blank" rel="noreferrer">Convex</a> with{" "}
          <a href="https://firecrawl.dev" target="_blank" rel="noreferrer">Firecrawl</a>, <a href="https://openai.com" target="_blank" rel="noreferrer">OpenAI</a> and{" "}
          <a href="https://agentmail.to" target="_blank" rel="noreferrer">AgentMail</a>.
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">Open source, self-hostable.</a>
      </footer>
    </div>
  );
}
