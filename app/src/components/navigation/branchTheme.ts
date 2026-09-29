import type { BranchOption } from '../../services/data'

export type BranchTheme = 'rumeli' | 'dondurma' | 'balik' | 'default'

const normalize = (value: string) =>
  value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Visual identity follows the selected branch without affecting authorization. */
export function getBranchTheme(branch: BranchOption | null): BranchTheme {
  if (!branch) return 'default'
  const identity = normalize(`${branch.key} ${branch.name}`)
  if (identity.includes('dondurma')) return 'dondurma'
  if (identity.includes('rumeli')) return 'rumeli'
  if (identity.includes('balik')) return 'balik'
  return 'default'
}

export const BRANCH_THEME_COPY: Record<BranchTheme, string> = {
  rumeli: 'Kafe · Restoran · Tatlı',
  dondurma: 'Açık dondurma & yaz neşesi',
  balik: 'Denizden sofraya',
  default: 'Günlük operasyon',
}

/**
 * Same accent hex values as `AppShell.module.css`'s `.theme-*` rules — kept
 * here too because a branch COMPARISON view (Manager Dashboard) needs each
 * branch's own identity color at once, not just the single ambient
 * `--branch-accent` the shell sets for the currently selected branch. This
 * is identity only (a small dot/left border), never a financial status
 * color — OK/WARNING/ERROR always use the fixed status palette.
 */
export const BRANCH_THEME_ACCENT: Record<BranchTheme, string> = {
  rumeli: '#f2a531',
  dondurma: '#4bbca8',
  balik: '#ef6b4a',
  default: 'var(--color-primary-600)',
}
