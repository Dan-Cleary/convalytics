import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("clean up rate limit windows", { minutes: 5 }, internal.rateLimit.cleanup, {});

export default crons;
