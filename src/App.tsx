import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ApplicationsPage } from "./clerk/ApplicationsPage";
import { BoardPage } from "./clerk/BoardPage";
import { DriftPage } from "./clerk/DriftPage";
import { NoticesPage } from "./clerk/NoticesPage";
import { ReviewPage } from "./clerk/ReviewPage";
import { SettingsPage } from "./clerk/SettingsPage";
import { ClerkShell } from "./clerk/Shell";
import { Apply } from "./pages/Apply";
import { Landing } from "./pages/Landing";
import { Openings, PublicCity } from "./pages/PublicCity";
import { Start } from "./pages/Start";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/start" element={<Start />} />
        <Route path="/c/:slug" element={<PublicCity />} />
        <Route path="/c/:slug/openings" element={<Openings />} />
        <Route path="/c/:slug/apply" element={<Apply />} />
        <Route path="/clerk" element={<ClerkShell />}>
          <Route index element={<BoardPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="applications" element={<ApplicationsPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="drift" element={<DriftPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
