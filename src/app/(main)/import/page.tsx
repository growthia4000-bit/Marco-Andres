'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle,
  ChevronRight,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  ShieldCheck,
  Sparkles,
  TableProperties,
  Upload,
  Users,
} from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

export default function ImportPage() {
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [importType, setImportType] = useState<'properties' | 'leads'>('properties')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const { t } = useI18n()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
      } else {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  const downloadTemplate = () => {
    if (importType === 'properties') {
      const csv = `${t('importPage.examples.propertiesHeader')}\n${t('importPage.examples.propertiesRow1')}`
      downloadFile(csv, t('importPage.examples.propertiesFile'), 'text/csv')
    } else {
      const csv = `${t('importPage.examples.leadsHeader')}\n${t('importPage.examples.leadsRow1')}`
      downloadFile(csv, t('importPage.examples.leadsFile'), 'text/csv')
    }
  }

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSelectedFile = (file: File | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('importPage.csvOnly'))
      return
    }

    setSelectedFile(file)
    setResult(null)
    setError('')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedFile(e.target.files?.[0] || null)
  }

  const handleImport = async () => {
    if (!selectedFile) {
      setError(t('importPage.selectFile'))
      return
    }

    setImporting(true)
    setResult(null)
    setError('')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('type', importType)

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || t('importPage.importError'))
      } else {
        setResult(data)
      }
    } catch {
      setError(t('importPage.connection'))
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_42%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_55%,_#eef2ff_100%)] px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 font-medium text-sky-700 transition hover:border-sky-300 hover:text-sky-800">
                    {t('dashboard.title')}
                  </Link>
                  <ChevronRight size={14} className="text-slate-300" />
                  <span className="font-medium text-slate-900">{t('importPage.title')}</span>
                </div>
                <div className="space-y-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-200">
                    <FileSpreadsheet size={22} />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{t('importPage.title')}</h1>
                    <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{t('importPage.heroSubtitle')}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-4 py-2.5 text-sm font-medium text-sky-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:from-sky-100 hover:to-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                  <ArrowLeft size={16} />
                  {t('importPage.backToPanel')}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-200">
                      <FileUp size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">{t('importPage.subtitle')}</h2>
                      <p className="mt-1 text-sm text-slate-500">{t('importPage.importCardSubtitle')}</p>
                    </div>
                  </div>
                  <button
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100"
                  >
                    <Download size={16} />
                    {t('importPage.downloadTemplate')}
                  </button>
                </div>

                <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-semibold ${step === 1 ? 'bg-sky-100 text-sky-700' : step === 2 ? 'bg-amber-100 text-amber-700' : step === 3 ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {step}
                        </div>
                        {step < 4 ? <ChevronsRight size={14} className="text-slate-300 sm:hidden" /> : null}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-900">{t(`importPage.process.step${step}Title`)}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{t(`importPage.process.step${step}Text`)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    onClick={() => { setImportType('properties'); setSelectedFile(null); setResult(null) }}
                    className={`rounded-3xl border p-5 text-left transition ${
                      importType === 'properties'
                        ? 'border-sky-300 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fafc_55%,#ffffff_100%)] shadow-sm ring-2 ring-sky-100'
                        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${importType === 'properties' ? 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-200' : 'bg-sky-50 text-sky-600'}`}>
                          <Building2 size={22} />
                        </div>
                        <p className="mt-4 font-semibold text-slate-900">{t('importPage.properties')}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{t('importPage.importProperties')}</p>
                      </div>
                      {importType === 'properties' ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">{t('importPage.selected')}</span> : null}
                    </div>
                  </button>

                  <button
                    onClick={() => { setImportType('leads'); setSelectedFile(null); setResult(null) }}
                    className={`rounded-3xl border p-5 text-left transition ${
                      importType === 'leads'
                        ? 'border-emerald-300 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_55%,#ffffff_100%)] shadow-sm ring-2 ring-emerald-100'
                        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${importType === 'leads' ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-sm shadow-violet-200' : 'bg-violet-50 text-violet-600'}`}>
                          <Users size={22} />
                        </div>
                        <p className="mt-4 font-semibold text-slate-900">{t('importPage.leads')}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{t('importPage.importLeads')}</p>
                      </div>
                      {importType === 'leads' ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t('importPage.selected')}</span> : null}
                    </div>
                  </button>
                </div>

                <div
                  className={`cursor-pointer rounded-[28px] border-2 border-dashed p-8 text-center transition ${isDragging ? 'border-sky-400 bg-sky-50' : selectedFile ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] hover:border-sky-300 hover:bg-sky-50/40'}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    handleSelectedFile(event.dataTransfer.files?.[0] || null)
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-50 to-cyan-50 text-sky-700 shadow-sm">
                    <Upload size={30} />
                  </div>

                  {selectedFile ? (
                    <div className="mt-5 space-y-2">
                      <p className="text-lg font-semibold text-slate-900">{selectedFile.name}</p>
                      <p className="text-sm text-slate-500">{t('importPage.fileReady')}</p>
                      <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-2">
                      <p className="text-lg font-semibold text-slate-900">{t('importPage.dragCsv')}</p>
                      <p className="text-sm text-slate-500">{t('importPage.clickSelect')}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{t('importPage.supportedFormat')}</p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-600 flex items-center gap-2">
                    <AlertCircle size={18} />
                    {error}
                  </div>
                )}

                {result && (
                  <div className={`mt-4 rounded-xl p-4 flex items-center gap-2 ${
                    result.imported > 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
                  }`}>
                    {result.imported > 0 ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    <span>{t('importPage.imported', { count: result.imported })}</span>
                  </div>
                )}

                {result?.errors && result.errors.length > 0 && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="mb-2 font-medium text-red-700">{t('importPage.errors', { count: result.errors.length })}</p>
                    <ul className="space-y-1 text-sm text-red-600">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={handleImport}
                  disabled={!selectedFile || importing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 px-6 py-3.5 text-sm font-medium text-white shadow-sm shadow-sky-200 transition hover:-translate-y-0.5 hover:from-sky-700 hover:to-cyan-700 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {t('importPage.importing')}
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      {t('importPage.importButton', { type: importType === 'properties' ? t('importPage.properties') : t('importPage.leads') })}
                    </>
                  )}
                </button>

                {!selectedFile && !importing ? (
                  <p className="text-sm text-slate-500">{t('importPage.disabledHint')}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-sm shadow-amber-200">
                  <TableProperties size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{t('importPage.fileFormat')}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{t('importPage.fileFormatText')}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t('importPage.previewTitle')}
                  </div>
                  {importType === 'properties' ? (
                    <div className="overflow-x-auto bg-white">
                      <table className="min-w-full text-sm text-slate-700">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">{t('importPage.examples.propertiesTable.title')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.propertiesTable.price')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.propertiesTable.type')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.propertiesTable.operation')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.propertiesTable.city')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-slate-100">
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row1.title')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row1.price')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row1.type')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row1.operation')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row1.city')}</td>
                          </tr>
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row2.title')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row2.price')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row2.type')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row2.operation')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.propertiesTable.row2.city')}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white">
                      <table className="min-w-full text-sm text-slate-700">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">{t('importPage.examples.leadsTable.firstName')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.leadsTable.lastName')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.leadsTable.email')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.leadsTable.phone')}</th>
                            <th className="px-4 py-3">{t('importPage.examples.leadsTable.source')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-slate-100">
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row1.firstName')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row1.lastName')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row1.email')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row1.phone')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row1.source')}</td>
                          </tr>
                          <tr className="border-t border-slate-100 bg-slate-50/70">
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row2.firstName')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row2.lastName')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row2.email')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row2.phone')}</td>
                            <td className="px-4 py-3">{t('importPage.examples.leadsTable.row2.source')}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('importPage.microcopyTitle')}</p>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                    <p>{t('importPage.microcopyUtf8')}</p>
                    <p>{t('importPage.microcopyHeaders')}</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-200">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">{t('importPage.beforeImportTitle')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t('importPage.beforeImportSubtitle')}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl shadow-sm ${item === 1 ? 'bg-sky-50 text-sky-600' : item === 2 ? 'bg-emerald-50 text-emerald-600' : item === 3 ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600'}`}>
                        {item === 1 ? <FileSpreadsheet size={16} /> : item === 2 ? <ShieldCheck size={16} /> : item === 3 ? <Download size={16} /> : <CheckCircle size={16} />}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{t(`importPage.beforeImport.items.item${item}Title`)}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{t(`importPage.beforeImport.items.item${item}Text`)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  )
}
