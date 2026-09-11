/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as cities from "../cities.js";
import type * as crawl from "../crawl.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as drafts from "../drafts.js";
import type * as drift from "../drift.js";
import type * as extract from "../extract.js";
import type * as firecrawl from "../firecrawl.js";
import type * as http from "../http.js";
import type * as legistar from "../legistar.js";
import type * as lib_csv from "../lib/csv.js";
import type * as lib_discover from "../lib/discover.js";
import type * as lib_draftTypes from "../lib/draftTypes.js";
import type * as lib_driftDiff from "../lib/driftDiff.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as lib_httpFetch from "../lib/httpFetch.js";
import type * as lib_seatStatus from "../lib/seatStatus.js";
import type * as lib_termDates from "../lib/termDates.js";
import type * as mail from "../mail.js";
import type * as roster from "../roster.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  cities: typeof cities;
  crawl: typeof crawl;
  crons: typeof crons;
  dev: typeof dev;
  drafts: typeof drafts;
  drift: typeof drift;
  extract: typeof extract;
  firecrawl: typeof firecrawl;
  http: typeof http;
  legistar: typeof legistar;
  "lib/csv": typeof lib_csv;
  "lib/discover": typeof lib_discover;
  "lib/draftTypes": typeof lib_draftTypes;
  "lib/driftDiff": typeof lib_driftDiff;
  "lib/extraction": typeof lib_extraction;
  "lib/httpFetch": typeof lib_httpFetch;
  "lib/seatStatus": typeof lib_seatStatus;
  "lib/termDates": typeof lib_termDates;
  mail: typeof mail;
  roster: typeof roster;
  seed: typeof seed;
  users: typeof users;
  workflow: typeof workflow;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
