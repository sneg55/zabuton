# Zabuton

Boards and commissions, kept current. Point Zabuton at a city's website and it finds the boards-and-commissions pages the city already publishes, builds the roster with terms and term limits, flags vacancies and expiring seats on a live board, takes resident applications on a public form, mails members and applicants on-thread, and re-reads the source pages on a schedule so the tracked roster never drifts from the published one.

Built on [Convex](https://convex.dev) with Firecrawl, OpenAI and AgentMail for the Convex All Gas Hackathon. See `hackathon.md` for the build log and the live URL.

## Run it

```bash
npm install
npx convex dev
npm run dev
```

Set these on the Convex deployment: `FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET`, `SITE_URL`, and the Convex Auth keys (`npx @convex-dev/auth`). Deploy the frontend to the deployment's `convex.site` URL with `npx static-hosting deploy`.

## Tests

```bash
npm test
```
