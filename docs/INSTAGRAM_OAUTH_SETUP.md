# Instagram OAuth Setup — Meta side

This is the runbook for creating the Meta app + provisioning the credentials
that the Faiceoff backend needs to verify creator IG accounts.

> Use the **Instagram API with Instagram Login** product. **Do NOT** use
> "Instagram Basic Display" — Meta deprecated it on Dec 4 2024 and it stops
> working entirely. The new product lets Business/Creator accounts connect
> directly without needing a Facebook Page.

---

## What you'll end up with

Three env vars in Vercel:

```
INSTAGRAM_APP_ID=1234567890123456
INSTAGRAM_APP_SECRET=abcdef1234567890abcdef1234567890
INSTAGRAM_OAUTH_REDIRECT_URI=https://faiceoff.com/api/auth/instagram/callback
```

Plus one Vercel env you already have (`KYC_ENCRYPTION_KEY`) is reused to
encrypt long-lived tokens at rest.

---

## Step-by-step

### 1. Create the Meta app

1. Go to https://developers.facebook.com/apps
2. Click **Create app**
3. Use case: **Other**
4. App type: **Business**
5. App name: `Faiceoff` (or `Faiceoff Dev` for a separate dev app)
6. Contact email: `marketing@rectangled.io`
7. Business portfolio: skip if you don't have one yet (can attach later)
8. Click **Create app** → enter your FB password

### 2. Add the Instagram product

1. From the new app's dashboard, scroll to **Add products to your app**
2. Find **Instagram** → click **Set up** (the tile with the IG logo)
3. On the Instagram page, click **API setup with Instagram Login**
4. You'll see two cards: **1. Generate access tokens** and **2. Configure webhooks**.
   You only need card 1 for OAuth.

### 3. Configure OAuth redirect URIs

1. Still on the Instagram product page, click **3. Set up Instagram business login** card
2. Under **Business login settings** click **Set up**
3. Under **OAuth redirect URIs**, click **Add** and enter:
   ```
   https://faiceoff.com/api/auth/instagram/callback
   ```
4. For local dev, also add:
   ```
   http://localhost:3000/api/auth/instagram/callback
   ```
5. Under **Deauthorize callback URL**: leave blank for MVP
   (we'll wire this when we add the revoke webhook handler)
6. Under **Data deletion request URL**:
   ```
   https://faiceoff.com/api/auth/instagram/data-deletion
   ```
   (we don't have this endpoint yet — Meta accepts the URL as long as it
   returns a JSON `{ url, confirmation_code }` body when called; we'll add
   the route before going live)
7. Click **Save changes**

### 4. Grab the credentials

1. In the left sidebar: **App settings → Basic**
2. Copy the **App ID** → paste into Vercel env `INSTAGRAM_APP_ID`
3. Click **Show** next to **App Secret**, paste FB password, copy
   the value → paste into Vercel env `INSTAGRAM_APP_SECRET`

### 5. Add Instagram testers (REQUIRED for dev mode)

In dev mode, only IG accounts you explicitly add as testers can connect.
This includes your own creator test accounts.

1. Sidebar: **App Roles → Roles**
2. Scroll to **Instagram testers** section
3. Click **Add Instagram testers** → enter the IG username
   (e.g. `burfirani_benya`)
4. The IG account holder now has to **accept the invite** at
   https://www.instagram.com/accounts/manage_access/
5. Until they accept, OAuth from their account will fail with a generic
   "this app isn't available" error.

### 6. App Review (only before going public)

While in dev mode, only Instagram testers can connect. To accept ANY
creator's IG account, submit for app review:

1. Sidebar: **App Review → Permissions and Features**
2. Request **`instagram_business_basic`** → fill out:
   - **How will you use this permission?** "Pull verified Instagram username,
     follower count, and profile picture for creators onboarding to Faiceoff,
     a marketplace where they license their face for AI-generated brand content."
   - **Screencast**: 60-90 sec video showing
     a creator clicking "Connect Instagram" on the Faiceoff onboarding page,
     completing the OAuth consent screen, and landing back on Faiceoff with
     their verified profile displayed.
3. Also request **`instagram_business_manage_insights`** with a similar
   description focused on showing engagement metrics to brands on creator
   profile cards.
4. Submission requires:
   - Verified business (Meta Business Verification — typically takes 1-2 days
     once you upload GST + incorporation docs)
   - Privacy Policy URL: `https://faiceoff.com/privacy` (must exist when you submit)
   - Terms of Service URL: `https://faiceoff.com/terms`
5. App review typically takes 5-15 business days. Apps usually get rejected
   the first time — read the rejection reason carefully and resubmit.

### 7. Verify it works (dev mode)

Once an Instagram tester accepts the invite + you've set the env vars in Vercel:

1. Open https://faiceoff.com/dashboard/onboarding/instagram (logged in as a creator)
2. Click **Connect Instagram**
3. Should redirect to instagram.com, show the consent screen
   ("Faiceoff wants to access your account info"), then redirect back to
   the onboarding page with your verified profile card showing
4. If you get a "this app isn't available" message: the IG account isn't
   listed as a tester (or the invite wasn't accepted).
5. If you get `personal_account_not_supported`: the IG account is on
   Personal mode. Go to IG app → Settings → Account → **Switch to Professional
   account → Creator** (or Business).

### 8. Production launch checklist

Before flipping the app to **Live mode** in Meta dashboard:

- [ ] `instagram_business_basic` approved via App Review
- [ ] `instagram_business_manage_insights` approved (optional but desired)
- [ ] Meta Business Verification complete
- [ ] Privacy Policy live at `/privacy`
- [ ] Terms of Service live at `/terms`
- [ ] Data Deletion URL endpoint (`/api/auth/instagram/data-deletion`) implemented
  — TODO, currently a placeholder URL in step 3 above
- [ ] Deauthorize webhook implemented (for handling user-initiated revoke)
  — TODO

---

## What the integration does

| Action | Endpoint | Trigger |
|---|---|---|
| Start OAuth | `GET /api/auth/instagram/start` | User clicks Connect Instagram |
| OAuth callback | `GET /api/auth/instagram/callback` | Meta redirects after consent |
| Disconnect | `POST /api/auth/instagram/disconnect` | User clicks X on connected card |
| Manual resync | `POST /api/auth/instagram/sync` | User clicks refresh icon |
| Status (for UI) | `GET /api/auth/instagram/status` | Onboarding page polls on load |
| Token refresh cron | `GET /api/cron/refresh-ig-tokens` | Daily at 4:30 UTC |

**Data pulled per creator (stored in `creators` row):**
- `instagram_user_id` — Meta's stable ID
- `instagram_handle` — verified username (no `@`)
- `instagram_followers` — real count (replaces self-reported bucket)
- `instagram_account_type` — BUSINESS or MEDIA_CREATOR
- `instagram_profile_pic_url` — CDN URL (refreshes daily)
- `instagram_media_count` — total posts
- `instagram_insights` — JSONB: `{ reach, impressions, profile_views, engagement_rate, total_likes, total_comments }`
- `instagram_access_token` — long-lived (60d) token, AES-256-GCM encrypted with `KYC_ENCRYPTION_KEY`
- `instagram_token_expires_at` — expiry timestamp
- `instagram_verified` — `true` once OAuth completes

Personal IG accounts get rejected at the callback (Meta restriction, not ours)
and the user is shown a manual-entry fallback.

---

## Common errors & fixes

| Error | Meaning | Fix |
|---|---|---|
| `personal_account_not_supported` | IG account is on Personal mode | Switch to Professional in IG app |
| `state_mismatch` | CSRF state cookie didn't match | User probably navigated away mid-flow. Retry. |
| `this app isn't available` (on IG page) | App is dev mode + IG account not added as tester | Add tester in Meta App Dashboard |
| `INSTAGRAM_APP_ID` undefined | Env vars not set in Vercel | Add them, redeploy |
| `IG short-token exchange failed (400)` | Wrong app secret or redirect URI mismatch | Verify redirect URI matches EXACTLY (incl trailing slash) |
| Token refresh fails after 60d | Long-lived token expired | Creator must reconnect via Connect Instagram button |
