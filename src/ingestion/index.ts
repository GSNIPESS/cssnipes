import { registerSport } from "./core/registry";
import { cs2Module } from "./cs2";

// Register every sport module here. Adding NHL/MLB = one new folder + one line.
registerSport(cs2Module);

export { getSportModule, listSports } from "./core/registry";
export { runIngestionTask } from "./core/runner";
export { INGESTION_TASKS } from "./core/types";
export type { IngestionTask, RunSummary, SportId } from "./core/types";
