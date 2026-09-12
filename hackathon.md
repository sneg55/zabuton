# Zabuton

Boards and commissions, kept current. Paste a city's website and Zabuton finds the boards-and-commissions pages the city already publishes, builds the roster with terms and term limits, flags vacancies and expiring seats on a live board, takes resident applications on a public form, mails members and applicants on-thread, and re-reads the source pages daily so the tracked roster never drifts from the published one.

- Live: https://original-spoonbill-489.convex.site
- Example city: https://original-spoonbill-489.convex.site/c/dublin-ca
- Demo video: (link)
- Social post: (link)

## Who it is for

City clerks. Every city has ten to thirty appointed bodies. Seats have terms, terms expire, residents apply, and the clerk carries all of it in a spreadsheet plus calendar reminders. Three live solicitations we read (Healdsburg, Ogden, Citrus County) ask for exactly this: "member term tracking and appointment management", "management of rules, terms and term limits", "support for applications of interest and provide status tracking". Zabuton is the open-source, self-hostable answer, and onboarding costs one URL instead of a data-entry project.

## What each sponsor does

- Convex: every table, the live board (vacancy and expiring flags are computed at query time, so the clerk board and the public roster update with no refresh), Convex Auth with a clerk role, the workflow component for the durable three-step bootstrap and the daily drift check, the static hosting component serving this site at convex.site, plus the Firecrawl and AgentMail components.
- Firecrawl: maps the city site to find the boards pages and roster PDFs, and scrapes the pages that block a plain fetch. It also powers the daily re-read behind the drift check.
- OpenAI: classifies each document (roster, vacancy notice, rules page) and then extracts it with a strict JSON schema. Every name and date carries the exact sentence it came from, and a value the document does not state is stored as unknown, never guessed. It also drafts applicant replies and term notices, which the clerk edits and approves.
- AgentMail: one inbox per city. Applications open a thread from the applicant's side, so every later reply from the clerk stays on that thread, and inbound replies land back on the application through the webhook. Term-expiry and reappointment notices go out from the same inbox after clerk approval.

## The three-minute demo

1. Paste Dublin's URL. Legistar covers three bodies and the city does not link it, so the run reads the website as well: 17 pages and documents, 7 bodies with members and term dates, merged with the term rules from the boards page. Confirm them; the December seats flag expiring, two seats are vacant, and a committee whose page stopped in 2022 shows three ended terms.
2. Open a body whose page has no term data: the field says unknown and links the source.
3. A resident applies from a second window; the application appears on the clerk's desk mid-sentence. The clerk approves a drafted on-thread reply.
4. Drift: the city page changed. The flag shows what the page says next to what is tracked.
5. The public roster at a convex.site URL, and "paste your own city".

## Stack

Convex (database, queries, mutations, actions, workflow, auth, static hosting), React + Vite, TypeScript throughout, vitest + convex-test for the backend.

## Build log

- 2026-08-27: research and spec. Firecrawl extraction was the unproven leg.
- 2026-09-11: proof first. OpenAI extraction with provenance on Dublin's Maddy Act PDF returned every member grounded; the same schema on a vacancy notice mis-slotted a count, which is why classification runs before extraction. Ann Arbor turned out to expose the Legistar API, so a second adapter reads rosters as JSON. Then schema, auth, roster queries, the clerk board, and the live site the same day.
- 2026-09-11, evening: Dublin rebuilt from scratch through the live pipeline rather than the seed, so the demo state is what a judge gets by pasting the URL. That run showed Legistar coverage can be partial (Dublin's instance lists three bodies), which is why Legistar is trusted alone only when the city links it and it covers at least five bodies.
- 2026-09-11, later: the full product. Durable bootstrap workflow (discover, fetch, classify and extract), draft review with per-field provenance, public roster and openings pages, applications with one thread per applicant, notices behind clerk approval, daily drift check, CSV import. First live runs: Ann Arbor produced 51 draft bodies from Legistar in seconds; Riverside also answers Legistar but with no serving members, fell through to Firecrawl, and produced 59 drafts from 35 documents in about a minute, which forced a generic-name filter and an evidence ranking on the review page. A drift check against Dublin's live PDF flagged a deliberately altered term end with both sides shown.
- 2026-09-11, night: a product-critic pass through every page as a resident and as the clerk. The one real failure was the landing call to action: Pleasanton's site listed a standard-specifications PDF among the candidates and reading it blew the action's memory, which killed the whole run. Fetches now stop at 8 MB, one bad document no longer stops the run, and PDFs need a roster keyword in the path or title. Pleasanton then produced 39 drafts from 24 documents. The other finding worth recording is the seat model: a seat with no holder used to render as "open seat, accepting applications" whether the city said vacant, gave only a count, or listed a member with no end date. Those are now three states (vacant, not listed, serving with an unknown end), and a holder named "Vacant" is a vacancy, not a person.
- 2026-09-12: judged it as a judge would and closed the gaps. AgentMail now does real work on the live desk: the Dublin inbox is dublin-ca@agentmail.to, an interview reply and a term-expiry notice went out as real mail, and a reply from the applicant came back through the webhook onto the same thread. Getting there needed a patch to the AgentMail component, whose inbox and thread actions are declared internal and whose config declares no env vars, both of which Convex 1.45 refuses from a parent app. The demo desk is read-only for anonymous sessions so judges can look without changing what the next judge sees. Ann Arbor is confirmed with its 29 citizen bodies and the council committees dismissed; the unfinished cities are gone. The annual appointments list is a page with a CSV, so the landing claim is now true. Crawls are capped per city and the public form per address.
- 2026-09-12, afternoon: a second judge pass, this time pasting a city the product had never seen. Santa Monica showed three things at once: the drift tab on Dublin was reporting the city's own "Vacant" rows as unknown people, the candidate list carried "powerboards" and "scoreboards" because keywords matched inside words, and a bot wall answered a .pdf address with HTML that then went to OpenAI as a PDF. All three are fixed, and a run whose drafts name nobody now says so instead of counting them as a win. The bigger change is ownership: a visitor who builds a city from the front page is signed in anonymously and owns that city, so review, confirm and drift work on it while the sample cities stay read-only; demo cities are wiped after a day. Ann Arbor's first real drift flag arrived the same afternoon.
- 2026-09-12, later: the demo video. Eight scenes under three minutes, recorded against the live site with testreel: paste a city and watch the run, confirm a draft on a city the session owns, the Dublin roster and an application, the real mail thread and notices on the desk, drift on Ann Arbor and the appointments list. Sources live in media/demo-src; the capture that pastes a city really crawls Pleasanton, and the trial city is wiped afterwards.
