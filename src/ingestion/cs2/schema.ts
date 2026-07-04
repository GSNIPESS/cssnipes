import { z } from "zod";

/**
 * Canonical CS2 ingestion records. Every provider (API, file import, future
 * scraper) normalizes its payload into these shapes; the mapper only ever
 * sees validated canonical records.
 */

const isoDate = z.coerce.date();

export const cs2TeamSchema = z.object({
  kind: z.literal("team"),
  externalId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  country: z.string().nullish(),
  logoUrl: z.string().url().nullish(),
});

export const cs2PlayerSchema = z.object({
  kind: z.literal("player"),
  externalId: z.string().min(1),
  nickname: z.string().min(1),
  slug: z.string().min(1).optional(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  country: z.string().nullish(),
  role: z.enum(["IGL", "AWPER", "RIFLER", "SUPPORT", "LURKER", "COACH"]).optional(),
  birthdate: isoDate.nullish(),
  isActive: z.boolean().optional(),
  /** Current team, by the provider's team id. */
  teamExternalId: z.string().nullish(),
});

export const cs2EventSchema = z.object({
  kind: z.literal("event"),
  externalId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  tier: z.enum(["S", "A", "B", "C", "QUALIFIER"]).optional(),
  prizePool: z.number().int().nonnegative().nullish(),
  location: z.string().nullish(),
  isLan: z.boolean().optional(),
  startDate: isoDate,
  endDate: isoDate.nullish(),
});

export const cs2MapStatSchema = z.object({
  playerExternalId: z.string().min(1),
  teamExternalId: z.string().min(1),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  headshots: z.number().int().nonnegative().optional(),
  flashAssists: z.number().int().nonnegative().optional(),
  firstKills: z.number().int().nonnegative().optional(),
  firstDeaths: z.number().int().nonnegative().optional(),
  clutchesWon: z.number().int().nonnegative().optional(),
  utilityDamage: z.number().int().nonnegative().optional(),
  adr: z.number().nonnegative().optional(),
  kast: z.number().nonnegative().optional(),
  rating: z.number().nonnegative().optional(),
});

export const cs2MatchMapSchema = z.object({
  mapNumber: z.number().int().positive(),
  mapName: z.string().min(1), // e.g. "de_mirage"
  status: z.enum(["UPCOMING", "LIVE", "COMPLETED"]).optional(),
  scoreA: z.number().int().nonnegative().optional(),
  scoreB: z.number().int().nonnegative().optional(),
  firstHalfA: z.number().int().nonnegative().optional(),
  firstHalfB: z.number().int().nonnegative().optional(),
  overtimeA: z.number().int().nonnegative().optional(),
  overtimeB: z.number().int().nonnegative().optional(),
  winner: z.enum(["A", "B"]).nullish(),
  pickedBy: z.enum(["A", "B"]).nullish(),
  playerStats: z.array(cs2MapStatSchema).optional(),
});

export const cs2MatchSchema = z.object({
  kind: z.literal("match"),
  externalId: z.string().min(1),
  eventExternalId: z.string().min(1),
  teamAExternalId: z.string().min(1),
  teamBExternalId: z.string().min(1),
  bestOf: z.number().int().positive().optional(),
  stage: z.string().nullish(),
  status: z.enum(["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]).optional(),
  scheduledAt: isoDate,
  startedAt: isoDate.nullish(),
  endedAt: isoDate.nullish(),
  scoreA: z.number().int().nonnegative().optional(),
  scoreB: z.number().int().nonnegative().optional(),
  winner: z.enum(["A", "B"]).nullish(),
  maps: z.array(cs2MatchMapSchema).optional(),
});

export const cs2RecordSchema = z.discriminatedUnion("kind", [
  cs2TeamSchema,
  cs2PlayerSchema,
  cs2EventSchema,
  cs2MatchSchema,
]);

export type Cs2Team = z.infer<typeof cs2TeamSchema>;
export type Cs2Player = z.infer<typeof cs2PlayerSchema>;
export type Cs2Event = z.infer<typeof cs2EventSchema>;
export type Cs2Match = z.infer<typeof cs2MatchSchema>;
export type Cs2Record = z.infer<typeof cs2RecordSchema>;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
