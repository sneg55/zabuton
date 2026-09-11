import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="signin"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        const data = new FormData(e.currentTarget);
        data.set("flow", flow);
        void signIn("password", data)
          .catch(() => setError(flow === "signIn" ? "That email and password did not match." : "Could not create the account. Use a longer password or a different email."))
          .finally(() => setBusy(false));
      }}
    >
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" required autoComplete="username" />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" name="password" type="password" required minLength={8} autoComplete={flow === "signIn" ? "current-password" : "new-password"} />
      </label>
      <button className="btn" type="submit" disabled={busy}>{flow === "signIn" ? "Sign in" : "Create account"}</button>
      <button type="button" className="btn btn-quiet" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
        {flow === "signIn" ? "First time here? Create the clerk account" : "Already have an account? Sign in"}
      </button>
      {error && <p className="error small">{error}</p>}
    </form>
  );
}
