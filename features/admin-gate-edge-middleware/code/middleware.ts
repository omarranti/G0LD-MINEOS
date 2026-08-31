import { NextResponse, type NextRequest } from "next/server";
import { ATTR_COOKIE, ATTR_COOKIE_MAX_AGE, buildAttrData } from "@/lib/attribution";
import { ADMIN_PIN_COOKIE, verifyAdminPinCookieValue } from "@/lib/admin-pin-edge";

/**
 * Hosts that should serve the /reviews surface at their root path.
 * Requests to https://reviews.example.com/<path> are internally
 * rewritten to /reviews/<path> so the entire domain reads as the
 * first-party reviews destination, while the absolute canonical
 * (set in the reviews page metadata) still points search engines at
 * https://example.com/reviews to keep the index single-source.
 */
const REVIEWS_HOSTS = new Set([
  "reviews.example.com",
  "www.reviews.example.com",
]);

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];

  if (REVIEWS_HOSTS.has(host)) {
    const { pathname } = req.nextUrl;
    if (pathname === "/reviews" || pathname.startsWith("/reviews/")) {
      return NextResponse.next();
    }
    const target = req.nextUrl.clone();
    target.pathname = pathname === "/" ? "/reviews" : `/reviews${pathname}`;
    return NextResponse.rewrite(target);
  }

  // Admin PIN gate at the edge. The layout-level check in admin/layout.tsx
  // only decides what the layout RENDERS; App Router still executes page
  // segments in parallel and serializes their data into the RSC flight
  // payload, so gating in the layout leaks every admin page's data to
  // cookie-less requests. Blocking here stops the page from rendering at
  // all. The layout check stays as defense in depth. This branch must run
  // BEFORE attribution, whose early return would otherwise skip it.
  {
    const { pathname } = req.nextUrl;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const candidate = req.cookies.get(ADMIN_PIN_COOKIE)?.value ?? "";
      if (!(await verifyAdminPinCookieValue(candidate))) {
        const target = req.nextUrl.clone();
        target.pathname = "/admin-access";
        target.search = "";
        target.searchParams.set("next", pathname + req.nextUrl.search);
        return NextResponse.redirect(target);
      }
      // Valid cookie: fall through so attribution behavior is unchanged.
    }
  }

  // First-touch attribution: when a visitor arrives carrying utm params,
  // a gclid, or a referral ref param and has no attribution cookie yet, stamp
  // one. Signup paths read it into the User row. Requests without
  // attribution signals fall straight through.
  if (!req.cookies.has(ATTR_COOKIE)) {
    const attr = buildAttrData(req.nextUrl.searchParams, req.nextUrl.pathname);
    if (attr) {
      const res = NextResponse.next();
      res.cookies.set(ATTR_COOKIE, JSON.stringify(attr), {
        maxAge: ATTR_COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next internals, API routes, common SEO/asset files, and any
  // request with a file extension (images, robots, sitemap, etc.).
  matcher: ["/((?!_next/|api/|favicon|robots|sitemap|.well-known/|.*\\..*).*)"],
};
