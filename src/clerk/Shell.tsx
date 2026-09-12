import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { SignIn } from "../SignIn";
import { SiteFrame, Wordmark } from "../ui/Site";
import { ShellSkeleton } from "../ui/Skeleton";

type ShellContext = { city: Doc<"cities">; readOnly: boolean };

export const READ_ONLY_HINT = "The demo desk is read-only. Sign in as the clerk to change things.";

export function useDesk() {
  return useOutletContext<ShellContext>();
}

const CITY_KEY = "zabuton.clerk.city";
const DEFAULT_CITY_SLUG = "dublin-ca";

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
      <AuthLoading><ShellSkeleton /></AuthLoading>
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
  if (cities === undefined || me === undefined) return <ShellSkeleton />;
  const ordered = [...cities].sort((a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed") || a.name.localeCompare(b.name));
  const city = ordered.find((c) => c._id === cityId) ?? ordered.find((c) => c.slug === DEFAULT_CITY_SLUG) ?? ordered[0];
  const readOnly = me?.role === "demo";
  if (me && me.role !== "clerk" && me.role !== "demo") {
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
        <Wordmark />
        <div className="rail-city">
          {cities.length > 1 ? (
            <select className="select" value={city._id} onChange={(e) => setCityId(e.target.value)}>
              {ordered.map((c) => <option key={c._id} value={c._id}>{c.name}{c.status === "confirmed" ? "" : " (in setup)"}</option>)}
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
          <Link to={`/c/${city.slug}/appointments`}>Appointments list</Link>
          <span>{me?.email ?? me?.name ?? "Demo clerk"}</span>
          <button className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main>
        {readOnly && (
          <div className="demo-banner">
            <span>Demo desk: everything is visible, nothing saves. Sign in as the clerk to change things.</span>
            <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>Sign in as the clerk</button>
          </div>
        )}
        <Outlet context={{ city, readOnly } satisfies ShellContext} />
      </main>
    </div>
  );
}
