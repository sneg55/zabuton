import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { SignIn } from "../SignIn";
import { SiteFrame } from "../ui/Site";

type ShellContext = { city: Doc<"cities"> };

const CITY_KEY = "zabuton.clerk.city";

function readStoredCity(): string | null {
  try {
    return window.localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

function writeStoredCity(cityId: string) {
  try {
    window.localStorage.setItem(CITY_KEY, cityId);
  } catch {
    return;
  }
}

export function useCity() {
  return useOutletContext<ShellContext>().city;
}

export function ClerkShell() {
  return (
    <>
      <AuthLoading><div className="site"><div className="hero" /></div></AuthLoading>
      <Unauthenticated>
        <SiteFrame>
          <section className="hero">
            <div className="hero-head">
              <h1 className="display display-xl">Clerk desk</h1>
              <p className="lede">Sign in to review drafts, confirm bodies, handle applications and approve notices.</p>
            </div>
            <SignIn />
          </section>
        </SiteFrame>
      </Unauthenticated>
      <Authenticated><ShellInner /></Authenticated>
    </>
  );
}

function ShellInner() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const cities = useQuery(api.roster.cities);
  const [cityId, setCityId] = useState<string | null>(() => readStoredCity());
  useEffect(() => {
    if (cityId) writeStoredCity(cityId);
  }, [cityId]);
  if (cities === undefined || me === undefined) return null;
  const city = cities.find((c) => c._id === cityId) ?? cities.find((c) => c.status === "confirmed") ?? cities[0];
  if (me && me.role !== "clerk") {
    return (
      <SiteFrame>
        <section className="hero">
          <div className="hero-head">
            <h1 className="display display-lg">This account is not a clerk account</h1>
            <p className="lede">The first account created on this deployment holds the clerk role. Ask that person to sign in, or use a different deployment for your city.</p>
            <div className="row"><button className="btn btn-secondary" onClick={() => void signOut()}>Sign out</button></div>
          </div>
        </section>
      </SiteFrame>
    );
  }
  if (!city) {
    return (
      <SiteFrame>
        <section className="hero">
          <div className="hero-head">
            <h1 className="display display-lg">No city yet</h1>
            <p className="lede">Start from the front page: paste the city's website and the bootstrap will bring the first drafts here.</p>
            <div className="row"><Link to="/" className="btn">Go to the front page</Link></div>
          </div>
        </section>
      </SiteFrame>
    );
  }
  return (
    <div className="shell">
      <aside className="rail">
        <Link to="/" className="wordmark">Zabuton</Link>
        <div className="rail-city">
          {cities.length > 1 ? (
            <select className="select" value={city._id} onChange={(e) => setCityId(e.target.value)}>
              {cities.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          ) : (
            <strong>{city.name}</strong>
          )}
          <span className="small muted">{city.domain}</span>
        </div>
        <nav>
          <NavLink to="/clerk" end>Board</NavLink>
          <NavLink to="/clerk/review">Review drafts</NavLink>
          <NavLink to="/clerk/applications">Applications</NavLink>
          <NavLink to="/clerk/notices">Notices</NavLink>
          <NavLink to="/clerk/drift">Drift</NavLink>
          <NavLink to="/clerk/settings">Settings</NavLink>
        </nav>
        <div className="rail-foot">
          <Link to={`/c/${city.slug}`}>Public roster</Link>
          <span>{me?.email}</span>
          <button className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main>
        <Outlet context={{ city } satisfies ShellContext} />
      </main>
    </div>
  );
}
