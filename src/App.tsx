import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { ClerkBoard } from "./ClerkBoard";
import { SignIn } from "./SignIn";

export default function App() {
  const { signOut } = useAuthActions();
  return (
    <main>
      <header>
        <h1>Zabuton</h1>
        <Authenticated>
          <button onClick={() => void signOut()}>Sign out</button>
        </Authenticated>
      </header>
      <AuthLoading>
        <p className="muted">Loading</p>
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <ClerkBoard />
      </Authenticated>
    </main>
  );
}
