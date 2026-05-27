import { NextResponse } from 'next/server'
import { updateCommercialStatusAction, suspendTenantAction, reactivateTenantAction } from '../../(main)/admin/actions'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  try {
    const data = await request.json()
    const { action, payload } = data
    
    const formData = new FormData()
    if (payload) {
      Object.entries(payload).forEach(([k, v]) => formData.append(k, String(v)))
    }

    if (action === 'updateCommercialStatusAction') {
      await updateCommercialStatusAction(formData)
    } else if (action === 'suspendTenantAction') {
      await suspendTenantAction(formData)
    } else if (action === 'reactivateTenantAction') {
      await reactivateTenantAction(formData)
    } else if (action === 'status') {
      const supabase = await createClient()
      const { data: tenant } = await supabase.from('tenants').select('*').eq('id', payload.tenantId).single()
      const { data: sub } = await supabase.from('subscriptions').select('*').eq('tenant_id', payload.tenantId).eq('is_current', true).single()
      return NextResponse.json({ success: true, tenant, sub })
    }
    
    return NextResponse.json({ success: true })
  } catch(e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message })
  }
}
