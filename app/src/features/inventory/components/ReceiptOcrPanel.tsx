import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { Worker } from 'tesseract.js'
import { Button, Card, Note, Stack } from '../../../components/ui'
import {
  parseReceiptText,
  type ParsedReceiptText,
} from '../../../domain/receiptOcr/parseReceiptText'
import styles from './ReceiptOcrPanel.module.css'

const MAX_FILE_SIZE = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function formatMoney(minor: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    minor / 100,
  )
}

function statusLabel(status: string) {
  if (status.includes('loading')) return 'Tanıma sistemi hazırlanıyor'
  if (status.includes('initializing')) return 'Dil modeli hazırlanıyor'
  if (status.includes('recognizing')) return 'Belge okunuyor'
  return 'Belge analiz ediliyor'
}

export function ReceiptOcrPanel({
  onReferenceSuggested,
}: {
  onReferenceSuggested: (value: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<ParsedReceiptText | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const runIdRef = useRef(0)

  useEffect(
    () => () => {
      runIdRef.current += 1
      if (workerRef.current) void workerRef.current.terminate()
    },
    [],
  )

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )

  function clearState() {
    runIdRef.current += 1
    if (workerRef.current) void workerRef.current.terminate()
    workerRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setProgress(0)
    setProgressLabel('')
    setAnalyzing(false)
    setError(null)
    setRawText('')
    setResult(null)
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    event.target.value = ''
    clearState()
    if (!selected) return
    if (!ALLOWED_TYPES.has(selected.type)) {
      setError('Yalnızca JPG, PNG veya WebP fotoğraf seçebilirsiniz.')
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError('Fotoğraf en fazla 8 MB olabilir.')
      return
    }
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
  }

  async function analyze() {
    if (!file || analyzing) return
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setAnalyzing(true)
    setError(null)
    setRawText('')
    setResult(null)
    setProgress(0)
    setProgressLabel('Tanıma sistemi hazırlanıyor')
    try {
      const { createWorker } = await import('tesseract.js')
      if (runIdRef.current !== runId) return
      const worker = await createWorker(['tur', 'eng'], undefined, {
        logger(message) {
          if (runIdRef.current !== runId) return
          setProgress(Math.round(message.progress * 100))
          setProgressLabel(statusLabel(message.status))
        },
      })
      workerRef.current = worker
      const recognition = await worker.recognize(file)
      if (runIdRef.current !== runId) return
      const text = recognition.data.text.trim()
      if (!text) {
        setError(
          'Fotoğrafta okunabilir metin bulunamadı. Daha aydınlık ve net bir fotoğraf deneyin.',
        )
        return
      }
      const parsed = parseReceiptText(text)
      setRawText(text)
      setResult(parsed)
      if (parsed.reference) onReferenceSuggested(parsed.reference)
      setProgress(100)
      setProgressLabel(
        `Okuma tamamlandı · güven ${Math.round(recognition.data.confidence)}%`,
      )
    } catch {
      if (runIdRef.current === runId)
        setError('Belge okunamadı. Bağlantıyı ve fotoğrafı kontrol edip yeniden deneyin.')
    } finally {
      if (workerRef.current) await workerRef.current.terminate().catch(() => undefined)
      workerRef.current = null
      if (runIdRef.current === runId) setAnalyzing(false)
    }
  }

  return (
    <Card>
      <Stack gap="sm">
        <div>
          <h2 className={styles.title}>Fişi fotoğraftan oku</h2>
          <p className={styles.description}>
            Depo fişini kamerayla çekin veya galeriden seçin. Okuma bu cihazda yapılır.
          </p>
        </div>
        {!file && (
          <label className={styles.fileButton}>
            <span aria-hidden="true">📷</span>Fiş fotoğrafı seç
            <input
              className={styles.hiddenInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleFile}
            />
          </label>
        )}
        {previewUrl && (
          <img
            className={styles.preview}
            src={previewUrl}
            alt="Seçilen depo fişi önizlemesi"
          />
        )}
        {file && !result && (
          <div className={styles.actions}>
            <Button type="button" onClick={() => void analyze()} loading={analyzing}>
              Metni Analiz Et
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={clearState}
              disabled={analyzing}
            >
              Fotoğrafı Değiştir
            </Button>
          </div>
        )}
        {analyzing && (
          <div className={styles.progressBlock} aria-live="polite">
            <div className={styles.progressText}>
              <span>{progressLabel}</span>
              <strong>{progress}%</strong>
            </div>
            <progress className={styles.progress} max="100" value={progress} />
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className={styles.result} aria-live="polite">
            <div className={styles.resultHeader}>
              <strong>Okunan taslak</strong>
              <Button type="button" variant="secondary" onClick={clearState}>
                Yeni Fotoğraf
              </Button>
            </div>
            <dl className={styles.fields}>
              <div>
                <dt>Belge no</dt>
                <dd>{result.reference ?? 'Bulunamadı'}</dd>
              </div>
              <div>
                <dt>Belge tarihi</dt>
                <dd>{result.documentDate ?? 'Bulunamadı'}</dd>
              </div>
              <div>
                <dt>Belge toplamı</dt>
                <dd>
                  {result.totalMinor === null
                    ? 'Bulunamadı'
                    : formatMoney(result.totalMinor)}
                </dd>
              </div>
            </dl>
            <details className={styles.rawText}>
              <summary>Okunan metni göster</summary>
              <pre>{rawText}</pre>
            </details>
          </div>
        )}
        <Note>
          OCR sonucu yalnızca taslaktır. Ürünleri, miktarları, birimleri ve maliyetleri
          fişle karşılaştırmadan stok girişini kaydetmeyin.
        </Note>
      </Stack>
    </Card>
  )
}
