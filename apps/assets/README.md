# schEDU assets — assets.scheduhq.com

Password-protected static host for the marketing kit in `public/` (hub,
animations + MP4s, screenshot gallery, style guide, reactive post templates).
HTTP Basic Auth is enforced at the edge by `middleware.ts` for **every** file,
including direct MP4/PNG URLs. No env vars set = everything 401s (fail closed).

## Deploy (one time, ~5 minutes)

```sh
cd apps/assets
npx vercel login                       # sign in / create the Vercel account
npx vercel link                        # create project, name it "schedu-assets"
npx vercel env add ASSETS_USER production    # e.g. schedu
npx vercel env add ASSETS_PASS production    # pick a strong shared password
npx vercel deploy --prod
```

That already gives you a working private URL (`schedu-assets-*.vercel.app`).

## Attach the domain

1. Vercel dashboard → schedu-assets → Settings → Domains → add
   `assets.scheduhq.com`.
2. At your DNS provider for scheduhq.com, add:
   `CNAME  assets  cname.vercel-dns.com`
3. Wait for DNS + cert (usually minutes), then share with the team:
   URL + username + password. Browsers show a native login prompt.

## Updating the kit

Edit files in `public/` (or drop new videos into `public/videos/`), then
`npx vercel deploy --prod` again. To rotate the password:
`npx vercel env rm ASSETS_PASS production && npx vercel env add ASSETS_PASS production`
and redeploy.

Notes: a shared password is access control, not secrecy — anyone holding it
can forward it. Keep anything genuinely sensitive off this subdomain. The
`X-Robots-Tag: noindex` header keeps search engines away even if the password
ever gets removed.
