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
    .from('properties')
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
  const { title, price, property_type, deal_type, description, address, city, area_sqm, rooms, bathrooms } = body

  if (!title || !price) {
    return NextResponse.json({ error: 'Title and price are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('properties')
    .insert({
      tenant_id: profile.tenant_id,
      title,
      price: parseFloat(price),
      property_type: property_type || 'apartment',
      deal_type: deal_type || 'sale',
      description: description || null,
      address: address || null,
      city: city || null,
      area_sqm: area_sqm ? parseFloat(area_sqm) : null,
      rooms: rooms ? parseInt(rooms) : null,
      bathrooms: bathrooms ? parseInt(bathrooms) : null,
      agent_id: user.id,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
