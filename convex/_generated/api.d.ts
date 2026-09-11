/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as auth from "../auth.js";
import type * as dev from "../dev.js";
import type * as firecrawl from "../firecrawl.js";
import type * as http from "../http.js";
import type * as lib_drafting from "../lib/drafting.js";
import type * as lib_seatStatus from "../lib/seatStatus.js";
import type * as lib_termDates from "../lib/termDates.js";
import type * as mail from "../mail.js";
import type * as mailStore from "../mailStore.js";
import type * as members from "../members.js";
import type * as notices from "../notices.js";
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
  applications: typeof applications;
  auth: typeof auth;
  dev: typeof dev;
  firecrawl: typeof firecrawl;
  http: typeof http;
  "lib/drafting": typeof lib_drafting;
  "lib/seatStatus": typeof lib_seatStatus;
  "lib/termDates": typeof lib_termDates;
  mail: typeof mail;
  mailStore: typeof mailStore;
  members: typeof members;
  notices: typeof notices;
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
