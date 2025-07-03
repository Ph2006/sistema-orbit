import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Rotas protegidas - todas as rotas dentro de (main)
  const protectedPaths = [
    '/dashboard',
    '/orders', 
    '/customers',
    '/quality',
    '/materials',
    '/costs',
    '/quotations',
    '/company'
  ];

  const isProtectedRoute = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  );

  // Se for uma rota protegida, verificar autenticação
  if (isProtectedRoute) {
    // Verificar se existe token do Firebase nos cookies
    const authCookie = request.cookies.get('firebase-auth-token');
    
    // Se não há cookie de autenticação, redirecionar para login
    if (!authCookie) {
      const loginUrl = new URL('/', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
