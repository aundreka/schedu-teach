// Edge middleware: HTTP Basic Auth in front of EVERY request — pages, MP4s,
// screenshots. This is the whole point of hosting the kit here: a client-side
// password gate would leave direct file URLs (e.g. /videos/scene-01.mp4) open.
//
// Credentials come from the ASSETS_USER / ASSETS_PASS environment variables
// (set them in Vercel → Project → Settings → Environment Variables, or via
// `npx vercel env add`). Fails CLOSED: no env vars → everything is 401.

export const config = { matcher: "/(.*)" };

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export default function middleware(req: Request): Response | undefined {
  const user = process.env.ASSETS_USER;
  const pass = process.env.ASSETS_PASS;

  if (user && pass) {
    const expected = "Basic " + btoa(`${user}:${pass}`);
    const got = req.headers.get("authorization") ?? "";
    if (timingSafeEqual(got, expected)) {
      return undefined; // authenticated — continue to the static file
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="schEDU marketing kit", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
