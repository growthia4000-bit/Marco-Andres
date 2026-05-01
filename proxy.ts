import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = new Set(['/suspended'])
const PUBLIC_API_PATHS = new Set(['/api/invitations/verify'])

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.has(pathname)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return response
  }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, global_role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.global_role === 'superadmin' || !profile.tenant_id) {
    return response
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('status')
    .eq('id', profile.tenant_id)
    .single()

  if (!tenant || tenant.status !== 'suspended') {
    return response
  }

  if (pathname.startsWith('/api/')) {
    if (isPublicApiPath(pathname)) {
      return response
    }

    return NextResponse.json(
      {
        error: 'Tenant suspended',
        code: 'TENANT_SUSPENDED',
      },
      { status: 423 }
    )
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return response
  }

  const suspendedUrl = request.nextUrl.clone()
  suspendedUrl.pathname = '/suspended'
  suspendedUrl.search = ''

  return NextResponse.redirect(suspendedUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
