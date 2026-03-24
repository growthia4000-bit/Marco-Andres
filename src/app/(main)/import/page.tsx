'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react'

export default function ImportPage() {
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importType, setImportType] = useState<'properties' | 'leads'>('properties')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

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
      const csv = 'titulo,precio,tipo,operacion,ciudad,direccion,m2,habitaciones,banos,descripcion\nApartamento centrico,150000,apartamento,venta,Madrid,"Calle Gran Via 1",85,3,2,Amplio apartamento en el centro'
      downloadFile(csv, 'plantilla-propiedades.csv', 'text/csv')
    } else {
      const csv = 'nombre,apellido,email,telefono,fuente,notas\nJuan,Garcia,juan@email.com,612345678,web,Interesado en apartamentos en Madrid'
      downloadFile(csv, 'plantilla-leads.csv', 'text/csv')
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('Solo se permiten archivos CSV')
        return
      }
      setSelectedFile(file)
      setResult(null)
      setError('')
    }
  }

  const handleImport = async () => {
    if (!selectedFile) {
      setError('Selecciona un archivo')
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
        setError(data.error || 'Error al importar')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError('Error de conexion')
    } finally {
      setImporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-700">
            <ArrowLeft size={20} />
          </Link>
          <span className="text-slate-900 font-medium">Importar Datos</span>
        </div>
      </header>

      <main className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Importar desde CSV</h2>
          
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => { setImportType('properties'); setSelectedFile(null); setResult(null) }}
              className={`flex-1 p-4 rounded-xl border-2 transition ${
                importType === 'properties'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Home className="mx-auto mb-2" size={32} />
              <p className="font-medium text-slate-900">Propiedades</p>
              <p className="text-sm text-slate-500">Importar propiedades</p>
            </button>
            <button
              onClick={() => { setImportType('leads'); setSelectedFile(null); setResult(null) }}
              className={`flex-1 p-4 rounded-xl border-2 transition ${
                importType === 'leads'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <Users className="mx-auto mb-2" size={32} />
              <p className="font-medium text-slate-900">Leads</p>
              <p className="text-sm text-slate-500">Importar leads</p>
            </button>
          </div>

          <div className="mb-6">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-blue-500 hover:text-blue-600 text-sm"
            >
              <Download size={16} />
              Descargar plantilla CSV
            </button>
          </div>

          <div
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 transition cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="mx-auto text-slate-400 mb-4" size={48} />
            {selectedFile ? (
              <div>
                <p className="font-medium text-slate-900">{selectedFile.name}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-slate-900">Arrastra un archivo CSV aqui</p>
                <p className="text-sm text-slate-500 mt-1">o haz clic para seleccionar</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-center gap-2">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {result && (
            <div className={`mt-4 p-4 rounded-xl flex items-center gap-2 ${
              result.imported > 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
            }`}>
              {result.imported > 0 ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span>{result.imported} registros importados exitosamente</span>
            </div>
          )}

          {result?.errors && result.errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="font-medium text-red-700 mb-2">Errores ({result.errors.length}):</p>
              <ul className="text-sm text-red-600 space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!selectedFile || importing}
            className="mt-6 w-full px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload size={18} />
                Importar {importType === 'properties' ? 'Propiedades' : 'Leads'}
              </>
            )}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Formato del archivo CSV</h3>
          <p className="text-sm text-slate-600 mb-4">
            El archivo debe ser formato CSV con encabezados en la primera fila.
            Asegurate de usar codificacion UTF-8.
          </p>
          
          {importType === 'properties' ? (
            <div className="bg-slate-50 rounded-lg p-4 text-sm font-mono">
              <p className="text-slate-500">titulo,precio,tipo,operacion,ciudad</p>
              <p>Apartamento centrico,150000,apartamento,venta,Madrid</p>
              <p>Casa con jardin,350000,casa,venta,Barcelona</p>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-lg p-4 text-sm font-mono">
              <p className="text-slate-500">nombre,apellido,email,telefono,fuente</p>
              <p>Juan,Garcia,juan@email.com,612345678,web</p>
              <p>Maria,Lopez,maria@email.com,698765432,referido</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Home({ className, size }: { className?: string; size: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  )
}

function Users({ className, size }: { className?: string; size: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  )
}
