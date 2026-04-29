import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "clean idle presence",
  { minutes: 5 },
  internal.maintenance.cleanIdlePresence,
);

crons.interval(
  "clean old room events",
  { minutes: 5 },
  internal.maintenance.cleanOldEvents,
);

export default crons;
