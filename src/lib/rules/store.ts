import { prisma } from "@/lib/db";
import { DEFAULT_RULES, type RuleConfig } from "@/types";

let cache: { config: RuleConfig; updatedAtMs: number } | null = null;

/** Read-through cache: rules hot-reload as soon as updatedAt changes in DB. */
export async function getRules(): Promise<RuleConfig> {
  const row = await prisma.ruleConfigRow.findUnique({ where: { id: "default" } });
  if (!row) {
    const created = await prisma.ruleConfigRow.create({
      data: { id: "default", config: JSON.stringify(DEFAULT_RULES) },
    });
    const config = JSON.parse(created.config) as RuleConfig;
    cache = { config, updatedAtMs: created.updatedAt.getTime() };
    return config;
  }
  const updatedAtMs = row.updatedAt.getTime();
  if (!cache || cache.updatedAtMs !== updatedAtMs) {
    cache = { config: JSON.parse(row.config) as RuleConfig, updatedAtMs };
  }
  return cache.config;
}

export async function updateRules(patch: Partial<RuleConfig>): Promise<RuleConfig> {
  const current = await getRules();
  const merged: RuleConfig = {
    ...current,
    ...patch,
    geoLock: { ...current.geoLock, ...(patch.geoLock ?? {}) },
    bufferCabin: { ...current.bufferCabin, ...(patch.bufferCabin ?? {}) },
    thresholds: { ...current.thresholds, ...(patch.thresholds ?? {}) },
    blacklists: { ...current.blacklists, ...(patch.blacklists ?? {}) },
    whitelists: { ...current.whitelists, ...(patch.whitelists ?? {}) },
  };
  const row = await prisma.ruleConfigRow.upsert({
    where: { id: "default" },
    update: { config: JSON.stringify(merged) },
    create: { id: "default", config: JSON.stringify(merged) },
  });
  cache = { config: merged, updatedAtMs: row.updatedAt.getTime() };
  return merged;
}
