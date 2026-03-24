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
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  if (!['admin', 'coordinator'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only admins and coordinators can manage automations' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rules: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  if (!['admin', 'coordinator'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only admins and coordinators can manage automations' }, { status: 403 })
  }

  const { name, description, trigger_type, action_type, config, is_active } = await request.json()

  if (!name || !trigger_type || !action_type) {
    return NextResponse.json({ error: 'Name, trigger_type, and action_type are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('automation_rules')
    .insert({
      tenant_id: profile.tenant_id,
      name,
      description,
      trigger_type,
      action_type,
      config: config || {},
      is_active: is_active ?? true,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rule: data }, { status: 201 })
}
