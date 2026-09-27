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
