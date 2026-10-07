import { Card, LinkButton, Note, StatusChip, Stack } from '../../components/ui'
import { ROUTES } from '../../domain/commandCenter'
import { evidenceText, type EvidenceEntry, type FactPack, type Narrative, type NarrativeSection, type ResolvedNarrative } from '../../domain/managerReport'
import styles from './ManagerReports.module.css'

/** Where the manager can inspect the underlying records of a section (the existing screens; the report itself changes nothing). */
const DETAIL: Record<string, { to: string; label: string }> = {
  result: { to: ROUTES.reports, label: 'Raporlara git' },
  summary: { to: ROUTES.analytics, label: 'Analiz sayfasını aç' },
  performance: { to: ROUTES.analytics, label: 'Analiz sayfasını aç' },
  branches: { to: ROUTES.reports, label: 'Raporlara git' },
  attention: { to: '/app/manager', label: 'Kontrol merkezini aç' },
  operations: { to: ROUTES.reconciliation, label: 'Mutabakat kuyruğu' },
  issues: { to: ROUTES.reconciliation, label: 'Mutabakat kuyruğu' },
  inventory: { to: ROUTES.countOverview, label: 'Sayım incelemesi' },
  procurement: { to: ROUTES.procurement, label: 'Siparişlere git' },
  weather: { to: ROUTES.analytics, label: 'Hava ve analiz' },
}

const OPEN_BY_DEFAULT = new Set(['result', 'attention', 'summary', 'performance'])

const COMPLETENESS = {
  complete: { tone: 'success', label: 'Veri tam' },
  partial: { tone: 'warning', label: 'Kısmi veri' },
  no_data: { tone: 'neutral', label: 'Veri yok' },
} as const

function Evidence({ refs, pack }: { refs: string[]; pack: FactPack }) {
  const entries = refs.map((r) => [r, pack.evidence[r]] as const).filter((e): e is readonly [string, EvidenceEntry] => e[1] !== undefined)
  if (entries.length === 0) return null
  return (
    <details className={styles.evidence}>
      <summary>Dayanak ({entries.length})</summary>
      <ul>
        {entries.map(([ref, e]) => (
          <li key={ref}>
            <span>{e.label}</span>
            <strong>{evidenceText(e)}</strong>
            {e.support === 'partial' && <StatusChip tone="warning">Kısmi</StatusChip>}
            {e.kind === 'relationship' && <StatusChip tone="info">İlişki</StatusChip>}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** The lines of a section without the executive summary, which the hero card already shows (no repeated prose). */
const linesOf = (section: NarrativeSection, summary: string): string[] => section.body.split('\n').filter((l) => l && l !== summary)

function Section({ section, pack, summary }: { section: NarrativeSection; pack: FactPack; summary: string }) {
  const lines = linesOf(section, summary)
  const link = DETAIL[section.code]
  return (
    <Card className={styles.section} data-section={section.code}>
      <details open={OPEN_BY_DEFAULT.has(section.code)}>
        <summary className={styles.sectionTitle}>{section.title}</summary>
        <div className={styles.sectionBody}>
          <ul className={styles.lines}>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <Evidence refs={section.evidenceRefs} pack={pack} />
          {link && (
            <LinkButton to={link.to} variant="secondary">
              {link.label}
            </LinkButton>
          )}
        </div>
      </details>
    </Card>
  )
}

/** Renders a validated narrative: the headline and summary first, then the sections as collapsible cards (no wall of text). */
export function NarrativeView({ pack, resolved }: { pack: FactPack; resolved: ResolvedNarrative }) {
  const n: Narrative = resolved.narrative
  const c = COMPLETENESS[pack.completeness.overall]
  const noData = pack.completeness.overall === 'no_data'
  // a section that only repeated the summary is folded into the hero; its evidence stays reachable there
  const folded = n.sections.filter((s) => linesOf(s, n.executiveSummary).length === 0)
  const shown = n.sections.filter((s) => !folded.includes(s))
  return (
    <Stack>
      <Card className={styles.hero}>
        <div className={styles.chips}>
          <StatusChip tone={c.tone}>{c.label}</StatusChip>
          {'weekComplete' in pack && !pack.weekComplete && <StatusChip tone="warning">Hafta sürüyor</StatusChip>}
          {'isCurrentDate' in pack && !pack.isCurrentDate && <StatusChip tone="neutral">Geçmiş tarih</StatusChip>}
        </div>
        <h2 className={styles.headline}>{n.headline}</h2>
        <p className={styles.summary}>{n.executiveSummary}</p>
        {folded.length > 0 && <Evidence refs={[...new Set(folded.flatMap((s) => s.evidenceRefs))]} pack={pack} />}
      </Card>

      {noData ? (
        <Note>Bu dönem için kesinleşmiş veri bulunmuyor; ayrıntılı bir özet yazılmadı. Aşağıdaki bölümler yalnızca eldeki bilgileri ve sınırlamaları gösterir.</Note>
      ) : null}

      {shown.map((s) => (
        <Section key={s.code} section={s} pack={pack} summary={n.executiveSummary} />
      ))}

      {n.limitations.length > 0 && (
        <Card className={styles.section} data-section="limitations">
          <details>
            <summary className={styles.sectionTitle}>Sınırlamalar ({n.limitations.length})</summary>
            <ul className={styles.lines}>
              {n.limitations.map((l, i) => (
                <li key={`${l.code}-${i}`}>{l.text}</li>
              ))}
            </ul>
          </details>
        </Card>
      )}

      <p className={styles.footnote}>
        Bu özet doğrulanmış veri modellerinden kurallı olarak üretildi; yapay zekâ kullanılmadı. Üretim: {new Date(pack.generatedAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}
        {pack.provenance.snapshots.length > 0 ? ` · ${pack.provenance.snapshots.length} analiz anlık görüntüsü (sürümleri kayıtlı)` : ''}.
      </p>
    </Stack>
  )
}
