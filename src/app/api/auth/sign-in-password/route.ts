import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * POST /api/auth/sign-in-password
 *
 * Standard email + password login. This is the primary auth path — OTP is
 * only used during signup (to verify email ownership) and password reset.
 *
 * Body: { email, password }
 *
 * NOTE: Uses explicit NextResponse + setAll-on-response pattern instead of
 * the shared lib/supabase/server.ts client. The shared client relies on
 * `cookieStore.set()` propagating to the outgoing response, which works in
 * dev but is unreliable on Vercel production for newly-set auth cookies.
 * Setting cookies directly on the NextResponse we return guarantees the
 * `Set-Cookie` headers reach the browser.
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Pre-build the response we will return so we can attach cookies to it.
  let response = NextResponse.json({ success: true });

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set({ name, value, ...options });
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase returns "Invalid login credentials" for both "user not found"
    // and "wrong password" — by design, to not leak which emails are registered.
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return response;
}
