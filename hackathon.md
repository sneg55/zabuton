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

1. Paste Dublin's URL. The roster fills from the city's Local Appointments List PDF; the Youth Advisory Committee flags ended terms, the December seats flag expiring.
2. Open a body whose page has no term data: the field says unknown and links the source.
3. A resident applies from a second window; the application appears on the clerk's desk mid-sentence. The clerk approves a drafted on-thread reply.
4. Drift: the city page changed. The flag shows what the page says next to what is tracked.
5. The public roster at a convex.site URL, and "paste your own city".

## Stack

Convex (database, queries, mutations, actions, workflow, auth, static hosting), React + Vite, TypeScript throughout, vitest + convex-test for the backend.

## Build log

- 2026-08-27: research and spec. Firecrawl extraction was the unproven leg.
- 2026-09-11: proof first. OpenAI extraction with provenance on Dublin's Maddy Act PDF returned every member grounded; the same schema on a vacancy notice mis-slotted a count, which is why classification runs before extraction. Ann Arbor turned out to expose the Legistar API, so a second adapter reads rosters as JSON. Then schema, auth, roster queries, the clerk board, and the live site the same day.
- 2026-09-11, later: the full product. Durable bootstrap workflow (discover, fetch, classify and extract), draft review with per-field provenance, public roster and openings pages, applications with one thread per applicant, notices behind clerk approval, daily drift check, CSV import. First live runs: Ann Arbor produced 51 draft bodies from Legistar in seconds; Riverside also answers Legistar but with no serving members, fell through to Firecrawl, and produced 59 drafts from 35 documents in about a minute, which forced a generic-name filter and an evidence ranking on the review page. A drift check against Dublin's live PDF flagged a deliberately altered term end with both sides shown.
