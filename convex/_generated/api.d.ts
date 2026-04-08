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
import type * as authHelpers from "../authHelpers.js";
import type * as crons from "../crons.js";
import type * as deploymentTypes from "../deploymentTypes.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as oauth from "../oauth.js";
import type * as pageviews from "../pageviews.js";
import type * as projects from "../projects.js";
import type * as rateLimit from "../rateLimit.js";
import type * as stats from "../stats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  crons: typeof crons;
  deploymentTypes: typeof deploymentTypes;
  events: typeof events;
  http: typeof http;
  oauth: typeof oauth;
  pageviews: typeof pageviews;
  projects: typeof projects;
  rateLimit: typeof rateLimit;
  stats: typeof stats;
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

export declare const components: {};
