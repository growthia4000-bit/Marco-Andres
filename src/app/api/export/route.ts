import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'properties'
  const format = searchParams.get('format') || 'csv'

  switch (type) {
    case 'properties': {
      const { data, error } = await supabase
        .from('properties')
        .select('title, description, property_type, deal_type, price, address, city, postal_code, country, area_sqm, rooms, bathrooms, status, created_at')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (format === 'json') {
        return NextResponse.json({ data, count: data?.length || 0 })
      }

      const csv = convertToCSV(data || [], [
        { key: 'title', header: 'Titulo' },
        { key: 'description', header: 'Descripcion' },
        { key: 'property_type', header: 'Tipo' },
        { key: 'deal_type', header: 'Operacion' },
        { key: 'price', header: 'Precio' },
        { key: 'address', header: 'Direccion' },
        { key: 'city', header: 'Ciudad' },
        { key: 'postal_code', header: 'CP' },
        { key: 'area_sqm', header: 'm2' },
        { key: 'rooms', header: 'Hab' },
        { key: 'bathrooms', header: 'Banos' },
        { key: 'status', header: 'Estado' },
        { key: 'created_at', header: 'Fecha Creacion' },
      ])

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="propiedades-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    case 'leads': {
      const { data, error } = await supabase
        .from('leads')
        .select('first_name, last_name, email, phone, source, status, budget_min, budget_max, notes, created_at')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (format === 'json') {
        return NextResponse.json({ data, count: data?.length || 0 })
      }

      const csv = convertToCSV(data || [], [
        { key: 'first_name', header: 'Nombre' },
        { key: 'last_name', header: 'Apellido' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Telefono' },
        { key: 'source', header: 'Fuente' },
        { key: 'status', header: 'Estado' },
        { key: 'budget_min', header: 'Presupuesto Min' },
        { key: 'budget_max', header: 'Presupuesto Max' },
        { key: 'notes', header: 'Notas' },
        { key: 'created_at', header: 'Fecha Creacion' },
      ])

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    case 'appointments': {
      const { data, error } = await supabase
        .from('appointments')
        .select('title, description, appointment_type, status, start_time, end_time, location, created_at')
        .eq('tenant_id', profile.tenant_id)
        .order('start_time', { ascending: false })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (format === 'json') {
        return NextResponse.json({ data, count: data?.length || 0 })
      }

      const csv = convertToCSV(data || [], [
        { key: 'title', header: 'Titulo' },
        { key: 'description', header: 'Descripcion' },
        { key: 'appointment_type', header: 'Tipo' },
        { key: 'status', header: 'Estado' },
        { key: 'start_time', header: 'Fecha Inicio' },
        { key: 'end_time', header: 'Fecha Fin' },
        { key: 'location', header: 'Ubicacion' },
        { key: 'created_at', header: 'Fecha Creacion' },
      ])

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="citas-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      })
    }

    default:
      return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
  }
}

function convertToCSV(data: any[], columns: { key: string; header: string }[]): string {
  const headers = columns.map(c => c.header).join(',')
  const rows = data.map(item => 
    columns.map(col => {
      const value = item[col.key] ?? ''
      const stringValue = String(value)
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    }).join(',')
  )
  return [headers, ...rows].join('\n')
}
