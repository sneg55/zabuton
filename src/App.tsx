import { BrowserRouter, Route, Routes } from "react-router-dom";
import { BoardPage } from "./clerk/BoardPage";
import { ClerkShell } from "./clerk/Shell";
import { Landing } from "./pages/Landing";
import { Openings, PublicCity } from "./pages/PublicCity";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/c/:slug" element={<PublicCity />} />
        <Route path="/c/:slug/openings" element={<Openings />} />
        <Route path="/clerk" element={<ClerkShell />}>
          <Route index element={<BoardPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
