import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['text/csv', 'application/json', 'text/plain']
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Invalid file type. Use CSV.' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length < 2) {
      return NextResponse.json({ error: 'File must have headers and at least one row' }, { status: 400 })
    }

    const headers = rows[0].map(h => h.toLowerCase().trim())
    const data = rows.slice(1).filter(row => row.some(cell => cell.trim()))

    let result: { imported: number; errors: string[] }

    switch (type) {
      case 'properties':
        result = await importProperties(supabase, profile.tenant_id, user.id, headers, data)
        break
      case 'leads':
        result = await importLeads(supabase, profile.tenant_id, user.id, headers, data)
        break
      default:
        return NextResponse.json({ error: 'Invalid import type. Use "properties" or "leads".' }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}

async function importProperties(supabase: any, tenantId: string, userId: string, headers: string[], data: string[][]) {
  const imported: number[] = []
  const errors: string[] = []

  const titleIdx = headers.indexOf('titulo') !== -1 ? headers.indexOf('titulo') : headers.indexOf('title')
  const priceIdx = headers.indexOf('precio') !== -1 ? headers.indexOf('precio') : headers.indexOf('price')
  const typeIdx = headers.indexOf('tipo') !== -1 ? headers.indexOf('tipo') : headers.indexOf('property_type')
  const dealIdx = headers.indexOf('operacion') !== -1 ? headers.indexOf('operacion') : headers.indexOf('deal_type')
  const cityIdx = headers.indexOf('ciudad') !== -1 ? headers.indexOf('ciudad') : headers.indexOf('city')
  const descIdx = headers.indexOf('descripcion') !== -1 ? headers.indexOf('descripcion') : headers.indexOf('description')
  const addressIdx = headers.indexOf('direccion') !== -1 ? headers.indexOf('direccion') : headers.indexOf('address')
  const areaIdx = headers.indexOf('m2') !== -1 ? headers.indexOf('m2') : headers.indexOf('area_sqm')
  const roomsIdx = headers.indexOf('habitaciones') !== -1 ? headers.indexOf('habitaciones') : headers.indexOf('rooms')
  const bathsIdx = headers.indexOf('banos') !== -1 ? headers.indexOf('banos') : headers.indexOf('bathrooms')

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    try {
      const title = titleIdx >= 0 ? row[titleIdx]?.trim() : ''
      const priceStr = priceIdx >= 0 ? row[priceIdx]?.trim() : '0'

      if (!title) {
        errors.push(`Row ${i + 2}: Titulo requerido`)
        continue
      }

      const propertyData: any = {
        tenant_id: tenantId,
        title,
        price: parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
        status: 'active',
        agent_id: userId,
      }

      if (typeIdx >= 0 && row[typeIdx]) {
        propertyData.property_type = normalizePropertyType(row[typeIdx])
      }
      if (dealIdx >= 0 && row[dealIdx]) {
        propertyData.deal_type = normalizeDealType(row[dealIdx])
      }
      if (cityIdx >= 0 && row[cityIdx]) {
        propertyData.city = row[cityIdx].trim()
      }
      if (descIdx >= 0 && row[descIdx]) {
        propertyData.description = row[descIdx].trim()
      }
      if (addressIdx >= 0 && row[addressIdx]) {
        propertyData.address = row[addressIdx].trim()
      }
      if (areaIdx >= 0 && row[areaIdx]) {
        propertyData.area_sqm = parseFloat(row[areaIdx]) || null
      }
      if (roomsIdx >= 0 && row[roomsIdx]) {
        propertyData.rooms = parseInt(row[roomsIdx]) || null
      }
      if (bathsIdx >= 0 && row[bathsIdx]) {
        propertyData.bathrooms = parseInt(row[bathsIdx]) || null
      }

      const { data: result, error } = await supabase
        .from('properties')
        .insert(propertyData)
        .select('id')
        .single()

      if (error) {
        errors.push(`Row ${i + 2}: ${error.message}`)
      } else {
        imported.push(result.id)
      }
    } catch (err: any) {
      errors.push(`Row ${i + 2}: ${err.message}`)
    }
  }

  return { imported: imported.length, errors: errors.slice(0, 20) }
}

async function importLeads(supabase: any, tenantId: string, userId: string, headers: string[], data: string[][]) {
  const imported: number[] = []
  const errors: string[] = []

  const firstNameIdx = headers.indexOf('nombre') !== -1 ? headers.indexOf('nombre') : headers.indexOf('first_name')
  const lastNameIdx = headers.indexOf('apellido') !== -1 ? headers.indexOf('apellido') : headers.indexOf('last_name')
  const emailIdx = headers.indexOf('email') !== -1 ? headers.indexOf('email') : -1
  const phoneIdx = headers.indexOf('telefono') !== -1 ? headers.indexOf('telefono') : headers.indexOf('phone')
  const sourceIdx = headers.indexOf('fuente') !== -1 ? headers.indexOf('fuente') : headers.indexOf('source')
  const notesIdx = headers.indexOf('notas') !== -1 ? headers.indexOf('notas') : headers.indexOf('notes')

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    try {
      const firstName = firstNameIdx >= 0 ? row[firstNameIdx]?.trim() : ''
      const lastName = lastNameIdx >= 0 ? row[lastNameIdx]?.trim() : ''
      const email = emailIdx >= 0 ? row[emailIdx]?.trim() : ''

      if (!firstName && !email && !phoneIdx) {
        errors.push(`Row ${i + 2}: Nombre, email o telefono requerido`)
        continue
      }

      const leadData: any = {
        tenant_id: tenantId,
        first_name: firstName || 'Unknown',
        last_name: lastName || '',
        status: 'new',
        agent_id: userId,
      }

      if (emailIdx >= 0 && row[emailIdx]) {
        leadData.email = row[emailIdx].trim()
      }
      if (phoneIdx >= 0 && row[phoneIdx]) {
        leadData.phone = row[phoneIdx].trim()
      }
      if (sourceIdx >= 0 && row[sourceIdx]) {
        leadData.source = row[sourceIdx].trim().toLowerCase()
      }
      if (notesIdx >= 0 && row[notesIdx]) {
        leadData.notes = row[notesIdx].trim()
      }

      const { data: result, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id')
        .single()

      if (error) {
        errors.push(`Row ${i + 2}: ${error.message}`)
      } else {
        imported.push(result.id)
      }
    } catch (err: any) {
      errors.push(`Row ${i + 2}: ${err.message}`)
    }
  }

  return { imported: imported.length, errors: errors.slice(0, 20) }
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  return lines.map(line => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    result.push(current)
    return result
  })
}

function normalizePropertyType(value: string): string {
  const v = value.toLowerCase()
  if (v.includes('apartamento') || v.includes('piso')) return 'apartment'
  if (v.includes('casa') || v.includes('chalet') || v.includes('villa')) return 'house'
  if (v.includes('terreno')) return 'land'
  if (v.includes('local') || v.includes('comercial')) return 'commercial'
  if (v.includes('atico') || v.includes('ático')) return 'penthouse'
  return 'other'
}

function normalizeDealType(value: string): string {
  const v = value.toLowerCase()
  if (v.includes('venta') || v.includes('sale')) return 'sale'
  if (v.includes('alquiler') || v.includes('rent')) return 'rental'
  return 'sale'
}
