import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup')
  const isSuspendedPage = pathname.startsWith('/suspended')
  const isProtectedRoute = pathname.startsWith('/dashboard') ||
    pathname.startsWith('/flow-map') ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/channels') ||
    pathname.startsWith('/conversations') ||
    pathname.startsWith('/properties') ||
    pathname.startsWith('/leads') ||
    pathname.startsWith('/appointments') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/import') ||
    pathname.startsWith('/automations') ||
    pathname.startsWith('/team') ||
    pathname.startsWith('/admin') ||
    isSuspendedPage

  const redirectTo = (targetPath: string) => {
    const url = request.nextUrl.clone()
    url.pathname = targetPath
    return NextResponse.redirect(url)
  }

  if (!user && isProtectedRoute && !isAuthPage) {
    return redirectTo('/login')
  }

  if (user) {
    const { data: profile } = await adminSupabase
      .from('users')
      .select('tenant_id, global_role')
      .eq('id', user.id)
      .single()

    const isSuperadmin = profile?.global_role === 'superadmin'

    if (!isSuperadmin && pathname.startsWith('/admin')) {
      return redirectTo('/dashboard')
    }

    let tenantStatus: string | null = null

    if (profile?.tenant_id) {
      const { data: tenant } = await adminSupabase
        .from('tenants')
        .select('status')
        .eq('id', profile.tenant_id)
        .single()

      tenantStatus = tenant?.status ?? null
    }

    if (!isSuperadmin && tenantStatus === 'suspended' && !isSuspendedPage) {
      return redirectTo('/suspended')
    }

    if (!isSuperadmin && isSuspendedPage && tenantStatus !== 'suspended') {
      return redirectTo('/dashboard')
    }

    if (user && isAuthPage) {
      return redirectTo(isSuperadmin ? '/admin' : tenantStatus === 'suspended' ? '/suspended' : '/dashboard')
    }

    if (isSuperadmin && isSuspendedPage) {
      return redirectTo('/admin')
    }

    if (user && pathname === '/') {
      return redirectTo(isSuperadmin ? '/admin' : tenantStatus === 'suspended' ? '/suspended' : '/dashboard')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
