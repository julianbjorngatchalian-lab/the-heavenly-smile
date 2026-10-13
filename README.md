# The Heavenly Smile Dental Clinic – booking funnel (demo)

A simple three-step dental booking funnel, built with Claude Code by Julian Bjorn Gatchalian.
Prices, the offer, the phone number and the reviews are sample content. Reviews are placeholders.

## The funnel

| Step | Page | What happens |
|---|---|---|
| 1. Landing | `index.html` | New patient offer, services, why us, 3-step explainer, reviews, FAQ, booking form |
| 2. Booking | `book.html` | Patient picks a day and time (Mon–Fri 9–5 with a lunch break, Sat 9–1, ET) |
| 3. Thank-you | `thank-you.html` | Confirmation, "Add to my calendar", what to bring |

Behind it (`apps-script/Code.gs`, optional):

- New lead → row in a Google Sheet + alert email to the clinic.
- Booking → patient confirmation email (or a "new time" email if they rebook).
- Hourly: a "finish booking" email if someone gave details but picked no time within 2 hours, a reminder 24 hours before the visit, and a rebooking email when the clinic marks a visit "No-show".

Ad tracking: `utm_*`, `fbclid` and `gclid` are saved with each lead, and `dental_lead` / `dental_booking` events are pushed to `window.dataLayer` for Google Tag Manager or GA4.

## Files

```
index.html  book.html  thank-you.html
assets/style.css   assets/funnel.js
apps-script/Code.gs
README.md
```

## Deploy on Render

### 1. Put the files on GitHub
1. On github.com, click **+** (top right) → **New repository**.
2. Name it `heavenly-smile`. Public or private both work. Leave README, .gitignore and license **off**.
3. Click **Create repository**.
4. On the "Quick setup" page, click **uploading an existing file** (or **Add file → Upload files**).
5. Unzip `heavenly-smile.zip`. Open the `heavenly-smile` folder and **drag everything inside it** onto the page. `index.html` must be at the top level, not inside a folder.
6. Check that 7 files are listed (4 at the top level, 2 in `assets`, 1 in `apps-script`), then click the commit button.

### 2. Create the Render site
1. In Render, click **New → Static Site**.
2. Connect GitHub if asked, then pick the `heavenly-smile` repo and the `main` branch.
3. Publish directory: `.` (a single dot, the repo root). The site is plain HTML with nothing to build. If Render insists on a build command, use the same one as your portfolio site.
4. Click **Create Static Site**. When the deploy finishes, open the `onrender.com` link.

Render redeploys automatically every time you change a file in the repo.

### 3. Optional: turn on the automation
1. Create a Google Sheet → **Extensions → Apps Script** → paste `apps-script/Code.gs`.
2. In `CONFIG`, set `ALERT_EMAIL` to your email and `SITE_URL` to your Render link (with a trailing `/`).
3. Choose `setup` in the function dropdown → **Run** → approve the permissions.
4. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**. Copy the URL ending in `/exec`.
5. In GitHub, open `assets/funnel.js` → pencil icon → paste the URL into `WEBHOOK_URL = ""` → commit. Render redeploys.
6. Book a test visit with your own email. You should get the clinic alert and the confirmation email, and see a row in the Leads sheet.

Until step 3 is done, the site still works end to end; leads just aren't saved or emailed.

## Limits to know
- Times aren't checked against a real calendar, so two people can pick the same slot.
- The webhook is public. For a real clinic, add a shared secret or use GoHighLevel / n8n.
- No SMS is sent yet; the consent text covers it so it can be added later.
- Replace the placeholder reviews with real ones before showing it to a client.
