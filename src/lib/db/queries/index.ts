// Re-export every per-domain query module so callers can keep importing from
// `@/lib/db/queries` unchanged. Per-file boundaries are by data domain (see
// REVIEW-2026-05-05.md finding #6 / patch v2.8.1).
export * from "./users";
export * from "./brain-dumps";
export * from "./moments";
export * from "./recap";
export * from "./tasks";
export * from "./goals";
export * from "./momentum";
export * from "./calendar";
export * from "./locations";
export * from "./notifications";
export * from "./crisis";
export * from "./friends";
export * from "./medications";
export * from "./microtasks";
export * from "./rooms";
