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
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', profile.tenant_id)
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  })
}

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

  const body = await request.json()
  const { first_name, last_name, email, phone, source, status, budget_min, budget_max, notes } = body

  if (!first_name && !email && !phone) {
    return NextResponse.json({ error: 'First name, email, or phone is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      tenant_id: profile.tenant_id,
      first_name: first_name || 'Unknown',
      last_name: last_name || '',
      email: email || null,
      phone: phone || null,
      source: source || 'direct',
      status: status || 'new',
      budget_min: budget_min ? parseFloat(budget_min) : null,
      budget_max: budget_max ? parseFloat(budget_max) : null,
      notes: notes || null,
      agent_id: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
