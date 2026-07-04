import type { SportId, SportModule } from "./types";

const modules = new Map<SportId, SportModule<unknown>>();

export function registerSport(sportModule: SportModule<unknown>): void {
  if (modules.has(sportModule.sport)) {
    throw new Error(`Sport "${sportModule.sport}" is already registered`);
  }
  modules.set(sportModule.sport, sportModule);
}

export function getSportModule(sport: string): SportModule<unknown> {
  const sportModule = modules.get(sport as SportId);
  if (!sportModule) {
    throw new Error(
      `Unknown sport "${sport}". Registered: ${[...modules.keys()].join(", ") || "(none)"}`
    );
  }
  return sportModule;
}

export function listSports(): SportModule<unknown>[] {
  return [...modules.values()];
}
