import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="signin"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const data = new FormData(e.currentTarget);
        data.set("flow", flow);
        void signIn("password", data).catch((err: Error) => setError(err.message));
      }}
    >
      <label>
        Email
        <input name="email" type="email" required autoComplete="username" />
      </label>
      <label>
        Password
        <input name="password" type="password" required autoComplete={flow === "signIn" ? "current-password" : "new-password"} />
      </label>
      <button type="submit">{flow === "signIn" ? "Sign in" : "Create clerk account"}</button>
      <button type="button" className="link" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
        {flow === "signIn" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
