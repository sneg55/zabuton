import { Authenticated, Unauthenticated } from "convex/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
        <span>Zabuton reads the city's own website and keeps the roster honest. Built on Convex with Firecrawl, OpenAI and AgentMail.</span>
        <span>Open source, self-hostable.</span>
      </footer>
    </div>
  );
}
