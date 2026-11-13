# Deploy the web app on Cloudflare Pages (from an iPhone)

Takes about 10 minutes. Free. Your GitHub repo stays private.

## Settings at a glance

| Setting | Value |
|---|---|
| Repository | `GHomeFitnessApp` |
| Production branch | `claude/trusting-keller-sv6dmb` |
| Framework preset | None |
| Build command | *(leave empty — if it insists, type* `exit 0`*)* |
| Build output directory | `web` |
| Root directory | *(leave empty)* |
| Project name | something hard to guess, e.g. `rr-b31fe1` |

## Steps

1. Open **dash.cloudflare.com/sign-up** in Safari. Create a free account and verify your email.
2. In the menu, tap **Workers & Pages**, then **Create**.
3. Choose the **Pages** tab (not Workers), then **Import an existing Git repository** (or **Connect to Git**).
4. Choose **GitHub**. When GitHub asks, pick **Only select repositories**, then **GHomeFitnessApp**. Approve.
5. Select the repo and tap **Begin setup**. Fill in the table above.
6. Tap **Save and Deploy**. Wait about 1 minute for "Success".
7. Open `https://<project-name>.pages.dev` in **Safari**. Check that you see "PROTECTION — AWAITING CLINICAL ASSESSMENT".
8. Tap **Share**, then **Add to Home Screen**. From now on, open the app only from that icon.
9. In the app, do the following:
   1. Do your first **check-in**.
   2. Go to **Data → Add reminders to Calendar**.
   3. Go to **Data → Export backup** and save the file to iCloud Drive.

## Recommended settings after the first deploy

1. **Turn off preview copies.** Go to Project → **Settings → Builds & deployments → Preview branches** and choose **None**. Otherwise every other branch gets its own public URL.
2. **Optional: lock the site to your email.** Go to **Zero Trust → Access → Applications → Add → Self-hosted**:
   - Domain: `<project-name>.pages.dev`
   - Policy: Allow, Emails = your address
   - Session duration: 1 month

   You'll enter a one-time email code about once a month. Test offline use afterwards.

## Things that will bite you

1. **Never rename the project or change the domain.** Your data lives under that exact web address. A new address shows an empty app. Export a backup first if you ever must change it.
2. **Updates deploy automatically.** Every push to the production branch redeploys within about a minute. Your data is not affected.
3. **The URL is not secret by itself.** Search engines are told not to index the site (`_headers`, `robots.txt`). Your health entries never reach Cloudflare: they stay on the phone. Only the app code, which includes the v2.1 diagnosis text, is served.
4. **If the app is ever blank:** open it in Safari, not the home-screen icon, to see any error. Then restore your latest backup (**Data → Restore**).
