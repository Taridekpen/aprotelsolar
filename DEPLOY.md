# Deploy Aprotel Solar

The public site and the admin dashboard are static Vite apps. Host both on Vercel. The API is a Node server with MongoDB. Host it on Render. MongoDB itself is not part of either host: use MongoDB Atlas, and point Render at that database.

```text
Browser  ->  Vercel public site   (apps/site)
Browser  ->  Vercel admin         (apps/web)
Both     ->  Render API           (apps/api)  ->  MongoDB Atlas
```

Local development is unchanged. Leave `VITE_API_URL` unset and the Vite dev servers keep proxying `/api` to `http://127.0.0.1:4000`.

## 1. MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user and note the password.
3. Network Access: allow Render to connect. For a first deploy, allow `0.0.0.0/0`. Tighten this later if you have fixed egress addresses.
4. Copy the connection string. It looks like `mongodb+srv://USER:PASSWORD@cluster.mongodb.net/aprotel_solar`.
5. The database name in that string must be `aprotel_solar`. Product images are stored in the same database (GridFS), so a normal Atlas backup includes them.

## 2. API on Render

`render.yaml` in the repository root is a Blueprint for one web service, `aprotel-api`.

1. Push this repository to GitHub.
2. In Render, choose **New** then **Blueprint**, and select the repository.
3. Fill the values Render asks for. These are required:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | The Atlas connection string |
| `CORS_ORIGINS` | The two Vercel origins, comma-separated, no trailing slash. Add them after the Vercel projects exist, then redeploy the API. |
| `PUBLIC_APP_URL` | The admin URL, for example `https://aprotel-admin.vercel.app` |
| `API_PUBLIC_URL` | The Render URL, for example `https://aprotel-api.onrender.com` |
| `BOOTSTRAP_ADMIN_NAME` | The first administrator's name |
| `BOOTSTRAP_ADMIN_EMAIL` | The first administrator's email |
| `BOOTSTRAP_ADMIN_PASSWORD` | A strong password. Used only when no super administrator exists yet. |
| `ORDER_NOTIFY_EMAIL` | Inbox that receives catalogue requests |

The Blueprint already sets `NODE_ENV=production`, `TRUST_PROXY=true`, `PAYMENT_PROVIDER=none`, `COOKIE_SAMESITE=none`, and `COOKIE_SECURE=true`. `none` means the API starts without Paystack or Flutterwave. Online checkout is not part of the public site. `SameSite=None` is required so the admin on Vercel can keep its sign-in cookie when it calls Render.

4. Deploy. The build command is `npm install --include=dev && npm run build:api`. Render sets `NODE_ENV=production` before the build, and a plain `npm install` then skips the TypeScript packages the API needs to compile. The start command is `npm run start`. Render checks `GET /health`.
5. Open `https://YOUR-SERVICE.onrender.com/health`. It should return `{ "data": { "status": "ok" } }`. `GET /ready` returns ready only after MongoDB is connected.
6. On the Render shell, run `npm run seed` once. That inserts categories, offices, and services if they are missing. The bootstrap administrator is created on startup from the three `BOOTSTRAP_ADMIN_*` variables. It does not reset an existing password.

Optional email. Catalogue requests are saved even when mail is not configured. To also email `ORDER_NOTIFY_EMAIL`, set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Password reset links for administrators use the same SMTP settings. Without SMTP, a reset link is not delivered in production.

The free Render instance sleeps after inactivity. The first request after sleep can take about a minute.

## 3. Public site on Vercel

Create a Vercel project from the same GitHub repository.

| Setting | Value |
| --- | --- |
| Root Directory | `apps/site` |
| Include files outside the root | On. The site build needs the repository root and `packages/solar-engine`. |
| Framework | Vite (taken from `apps/site/vercel.json`) |
| Install | `npm install --prefix ../..` |
| Build | `npm run build:site --prefix ../..` |
| Output | `dist` |

`vercel.json` already sets the install command, build command, output directory, and the rewrite that sends unknown paths such as `/products/some-panel` to `index.html`.

Environment variable, set for Production (and Preview if you want preview URLs to work):

| Name | Value |
| --- | --- |
| `VITE_API_URL` | The Render origin, with no trailing slash, for example `https://aprotel-api.onrender.com` |

`VITE_API_URL` is read when Vercel builds the site. Redeploy after changing it.

## 4. Admin on Vercel

Create a second Vercel project from the same repository.

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Include files outside the root | On. The admin build needs the repository root and `packages/shared`. |
| Framework | Vite |
| Install | `npm install --prefix ../..` |
| Build | `npm run build:web --prefix ../..` |
| Output | `dist` |

`apps/web/vercel.json` matches those commands and rewrites admin routes such as `/products` to `index.html`.

| Name | Value |
| --- | --- |
| `VITE_API_URL` | The same Render origin, with no trailing slash |

## 5. Connect the three hosts

After both Vercel projects have their production URLs:

1. Set Render `CORS_ORIGINS` to both origins, for example `https://aprotel.vercel.app,https://aprotel-admin.vercel.app`. No spaces are required. No trailing slashes.
2. Set Render `PUBLIC_APP_URL` to the admin origin. Password-reset links use it.
3. Set Render `API_PUBLIC_URL` to the Render origin.
4. Redeploy the API so those values load.
5. Confirm each Vercel project has `VITE_API_URL` and redeploy both if you added it after the first build.

## 6. Check

1. `https://YOUR-API.onrender.com/health` returns ok, and `/ready` returns ready.
2. The public site lists published products. Open a product page directly, not only from the home page, and refresh. It should stay on that product.
3. Add a product to the cart and send a request with a name, phone, and email. The confirmation shows a reference such as `ENQ-...`.
4. Sign in at the admin URL with the bootstrap email and password. The sidebar includes Products and Requests, and the request from step 3 is listed.
5. Product photos load. They are served by the API, not by Vercel.

## Notes

- Do not commit `.env`. Render and Vercel store the production values.
- `PAYMENT_PROVIDER=development` cannot start when `NODE_ENV=production`. Leave it as `none` unless you later connect Paystack or Flutterwave.
- A new `BOOTSTRAP_ADMIN_PASSWORD` does not change an administrator that already exists.
- Atlas, Render, and Vercel each have their own billing. The steps above use the free tiers that were current when this guide was written.
