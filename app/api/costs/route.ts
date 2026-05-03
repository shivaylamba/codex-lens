import { NextResponse } from 'next/server'
import { getProjectSummaries, readStatsCache } from '@/lib/codex-reader'
import { cacheEfficiency, estimateTotalCostFromModel, getPricing } from '@/lib/pricing'
import type { CostAnalytics, DailyCost, ModelCostBreakdown, ProjectCost } from '@/types/claude'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [stats, projects] = await Promise.all([readStatsCache(), getProjectSummaries()])

  let totalCost = 0
  let totalSavings = 0
  const models: ModelCostBreakdown[] = Object.entries(stats.modelUsage).map(([model, usage]) => {
    const cost = estimateTotalCostFromModel(model, usage)
    const eff = cacheEfficiency(model, usage)
    totalCost += cost
    totalSavings += eff.savedUSD
    return {
      model,
      input_tokens: usage.inputTokens ?? 0,
      output_tokens: usage.outputTokens ?? 0,
      cache_write_tokens: usage.cacheCreationInputTokens ?? 0,
      cache_read_tokens: usage.cacheReadInputTokens ?? 0,
      reasoning_output_tokens: usage.reasoningOutputTokens ?? 0,
      estimated_cost: cost,
      cache_savings: eff.savedUSD,
      cache_hit_rate: eff.hitRate,
    }
  }).sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens))

  const daily: DailyCost[] = (stats.dailyModelTokens ?? stats.tokensByDate).map(day => {
    const costs: Record<string, number> = {}
    let total = 0
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      const p = getPricing(model)
      const cost = tokens * p.input
      costs[model] = cost
      total += cost
    }
    return { date: day.date, costs, total }
  })

  const by_project: ProjectCost[] = projects.slice(0, 25).map(project => ({
    slug: project.slug,
    display_name: project.display_name,
    estimated_cost: project.estimated_cost,
    input_tokens: project.input_tokens,
    output_tokens: project.output_tokens,
  }))

  const result: CostAnalytics = { total_cost: totalCost, total_savings: totalSavings, models, daily, by_project }
  return NextResponse.json(result)
}
