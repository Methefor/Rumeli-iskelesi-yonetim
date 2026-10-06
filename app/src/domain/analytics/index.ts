export * from './types'
export { isoWeekday, isMonday, weekDates, weekStartOf } from './week'
export {
  ANALYTICS_PARAMS,
  buildDailyAnalytics,
  buildWeeklyAnalytics,
  compare,
  computeDay,
  redactAnalytics,
  weatherEffect,
  type AnalyticsLineFact,
  type AnalyticsProductFact,
  type AnalyticsReportFact,
  type DayFacts,
  type WeatherDay,
} from './engine'
export {
  AI_CONTRACT_VERSION,
  AI_SYSTEM_PROMPT,
  buildAiInput,
  generateAiReport,
  validateAiOutput,
  type AiClaim,
  type AiInput,
  type AiOutput,
  type AiReportResult,
  type ValidationIssue,
} from './aiContract'
export { DEFAULT_ANALYTICS_SETTINGS, resolveAnalyticsSettings, type AnalyticsSettings } from './settings'
export { analyticsPermissionsFor, canAnalytics, type AnalyticsPermission } from './permissions'
export { deriveDailyInsights, deriveWeeklyInsights } from './insights'
