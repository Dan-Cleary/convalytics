import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("clean up rate limit windows", { minutes: 5 }, internal.rateLimit.cleanup, {});
crons.interval("cleanup provision abuse records", { hours: 2 }, internal.usage.cleanupProvisionAbuse, {});
crons.cron("nightly data retention", "0 3 * * *", internal.retention.runNightlyRetention, {});

export default crons;
