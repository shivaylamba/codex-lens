import type { TurnUsage, ModelUsage } from '@/types/claude'

interface ModelPricing {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export const PRICING: Record<string, ModelPricing> = {
  // Codex stores token counters, not billing totals. Keep unknown models at
  // zero unless the local app owner fills in a pricing table.
  'gpt-5.5':       { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  'gpt-5.4':       { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  'gpt-5.3-codex': { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  'crest-alpha':   { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  unknown:         { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
}

function getPricing(model: string): ModelPricing {
  if (PRICING[model]) return PRICING[model]
  // fuzzy match on prefix
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key) || key.startsWith(model.split('-').slice(0, 3).join('-'))) {
      return PRICING[key]
    }
  }
  return PRICING.unknown
}

export function estimateCostFromUsage(model: string, usage: TurnUsage): number {
  const p = getPricing(model)
  return (
    (usage.input_tokens                ?? 0) * p.input      +
    (usage.output_tokens               ?? 0) * p.output     +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
    (usage.cache_read_input_tokens     ?? 0) * p.cacheRead
  )
}

export function estimateCostFromSessionMeta(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = getPricing(model)
  return inputTokens * p.input + outputTokens * p.output
}

export interface CacheEfficiencyResult {
  savedUSD: number
  hitRate: number
  wouldHavePaidUSD: number
}

export function cacheEfficiency(
  model: string,
  usage: ModelUsage,
): CacheEfficiencyResult {
  const p = getPricing(model)
  const savedPerToken = p.input - p.cacheRead
  const savedUSD = usage.cacheReadInputTokens * savedPerToken
  const totalContext = usage.inputTokens + usage.cacheReadInputTokens
  const hitRate = totalContext > 0
    ? usage.cacheReadInputTokens / totalContext
    : 0
  const wouldHavePaidUSD =
    (usage.inputTokens + usage.cacheReadInputTokens) * p.input +
    usage.outputTokens * p.output +
    usage.cacheCreationInputTokens * p.cacheWrite
  return { savedUSD, hitRate, wouldHavePaidUSD }
}

export function estimateTotalCostFromModel(model: string, usage: ModelUsage): number {
  const p = getPricing(model)
  return (
    (usage.inputTokens                ?? 0) * p.input      +
    (usage.outputTokens               ?? 0) * p.output     +
    (usage.cacheCreationInputTokens   ?? 0) * p.cacheWrite +
    (usage.cacheReadInputTokens       ?? 0) * p.cacheRead
  )
}

export { getPricing }
export type { ModelPricing }
