# Putting this on a real domain

The site is fully live at https://sovi11.github.io/wildcard-chess/ — a custom domain is
cosmetic, but it is the cosmetic that makes people take a link seriously. Budget ~₹800–1500/yr
and about 20 minutes.

## 1. Buy the domain (only you can do this)

Good candidates, in order of preference — check availability at the registrar:

- `wildcardchess.com` — the obvious one; if free, take it
- `wildcard.chess`? — no such TLD; skip
- `wildcardchess.io` / `.gg` / `.app` — gamer-coded, fine (note: `.app` forces HTTPS, which we have)
- `playwildcard.chess`? — again no; `playwildcardchess.com` as fallback

Registrar: **Cloudflare Registrar** (at-cost pricing, no upsells) or **Porkbun** / **Namecheap**.
Avoid GoDaddy (renewal pricing).

## 2. Point it at the site — two options

### Option A: keep GitHub Pages (simplest)

1. In the repo: Settings → Pages → **Custom domain** → enter `wildcardchess.com` → Save.
   (This creates a `CNAME` file in the repo — commit it if prompted.)
2. At your registrar's DNS panel:
   - `A` records for the apex (`@`) → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `sovi11.github.io`
3. Back in GitHub Pages settings, tick **Enforce HTTPS** once the cert appears (~15 min).

### Option B: Cloudflare Pages (if you bought at Cloudflare anyway)

1. Cloudflare dashboard → Workers & Pages → **Create → Pages → Connect to Git** →
   pick `Sovi11/wildcard-chess`, framework preset **None**, build command empty,
   output directory `/`. Deploy.
2. Custom domains tab → add `wildcardchess.com`. DNS is automatic since the domain
   is already in Cloudflare.
3. **Then retire the GitHub Pages URL** (Settings → Pages → Source → None), or at
   minimum never share it again — two live origins split players' local ratings
   and confuse Supabase redirects.

## 3. The three code/config touch-ups after the domain is live

Tell Claude the domain and these get done in one commit:

1. `index.html` — canonical + og:url + og:image swap to the new domain.
2. `robots.txt` / `sitemap.xml` — same swap.
3. **Supabase** (you, 1 min): Authentication → URL Configuration → set **Site URL**
   to the new domain and add it to **Redirect URLs**. Keep the old GH Pages URL in
   Redirect URLs during the transition, then remove it.

## 4. Optional, later

- Search Console: verify the domain, submit `sitemap.xml`.
- Analytics: Plausible or GoatCounter (privacy-friendly, no cookie banner needed) —
  one `<script>` tag when you have an account.
