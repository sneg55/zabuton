import agentmail from "@agentmail/convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(staticHosting);
app.use(firecrawl, { env: { FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY! } });
app.use(agentmail);
app.use(workflow);

export default app;
