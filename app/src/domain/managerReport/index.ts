export * from './types'
export * from './inputs'
export { buildDailyFactPack, type DailyPackInput } from './dailyFactPack'
export { buildWeeklyFactPack, type WeeklyPackInput } from './weeklyFactPack'
export { renderDailyNarrative } from './renderDaily'
export { renderWeeklyNarrative } from './renderWeekly'
export { validateNarrative, type NarrativeIssue, type NarrativeIssueCode, type NarrativeValidation } from './narrativeValidator'
export {
  NARRATIVE_AI_CONTRACT_VERSION,
  NARRATIVE_AI_RULES,
  buildNarrativeAiInput,
  factPackFingerprint,
  generateNarrative,
  renderNarrative,
  resolveNarrative,
  sanitizeFactPack,
  type NarrativeAiInput,
  type ReportMetadata,
  type NarrativeModelCall,
  type ResolvedNarrative,
} from './narrativeAi'
export { limitationText } from './support'
export { dateTr, dateWithWeekdayTr, evidenceText } from './format'
