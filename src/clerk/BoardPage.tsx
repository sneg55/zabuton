import { ClerkBoard } from "../ClerkBoard";
import { useCity } from "./Shell";

export function BoardPage() {
  const city = useCity();
  return <ClerkBoard city={city} />;
}
