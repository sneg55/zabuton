import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { SignIn } from "../SignIn";
import { SiteFrame, Wordmark } from "../ui/Site";
import { ShellSkeleton } from "../ui/Skeleton";

type ShellContext = { city: Doc<"cities">; readOnly: boolean; clerkOnly: boolean };

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
  const [params] = useSearchParams();
  const wantedCity = params.get("city");
  const [cityId, setCityId] = useState<string | null>(() => wantedCity ?? readStoredCity());
  useEffect(() => {
    if (wantedCity) setCityId(wantedCity);
  }, [wantedCity]);
  useEffect(() => {
    if (cityId) writeStoredCity(cityId);
  }, [cityId]);
  if (cities === undefined || me === undefined) return <ShellSkeleton />;
  const isClerk = me?.role === "clerk";
  const visible = cities.filter((c) => isClerk || c.createdBy === undefined || c.createdBy === me?._id);
  const ordered = [...visible].sort((a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed") || a.name.localeCompare(b.name));
  const city = ordered.find((c) => c._id === cityId) ?? ordered.find((c) => c.slug === DEFAULT_CITY_SLUG) ?? ordered[0];
  const readOnly = !isClerk && city?.createdBy !== me?._id;
  const clerkOnly = !isClerk;
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
          {ordered.length > 1 ? (
            <select className="select" value={city._id} onChange={(e) => setCityId(e.target.value)}>
              {ordered.map((c) => <option key={c._id} value={c._id}>{c.name}{c.status === "confirmed" ? "" : c.createdBy === me?._id ? " (yours, in setup)" : " (in setup)"}</option>)}
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
            <span>Demo desk: everything is visible, nothing saves. Sign in as the clerk to change things, or build your own city from the front page and review it here.</span>
            <button className="btn btn-secondary btn-sm" onClick={() => void signOut()}>Sign in as the clerk</button>
          </div>
        )}
        {!readOnly && clerkOnly && (
          <div className="demo-banner">
            <span>Your city: review, confirm and check drift here. Mail and applications stay with the clerk. It is cleared after a day.</span>
          </div>
        )}
        <Outlet context={{ city, readOnly, clerkOnly } satisfies ShellContext} />
      </main>
    </div>
  );
}
