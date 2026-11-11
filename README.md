# SmartQR

SmartQR is a document and dynamic QR management platform. A QR code will point to a permanent SmartQR redirect identifier, not a storage URL, so its destination can be changed without replacing the printed code.

## Architecture

- `client/`: React single-page app served by Vite, with Tailwind CSS and Lucide icons.
- `server/`: Express API with security headers, CORS, rate limiting, and an isolated Mongoose connection module.
- Local requests to `/api` and `/r` are proxied by Vite to the API on port 5000.
- MongoDB is configured through `MONGODB_URI`. The API can start without it for setup checks; database-backed features require a working MongoDB connection.

## Local setup

Requirements: Node.js 20.19+ or 22.12+, npm, and MongoDB (local or Atlas) for database-backed features.

From the project root in PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Check the API at `http://localhost:5000/api/health` or through the Vite proxy at `http://localhost:5173/api/health`.

Set `MONGODB_URI` in `.env` to your local or Atlas connection string. Never commit `.env` or production credentials. To create a production client build, run `npm run build`; to start the API in production, run `npm start`.

## Authentication

Set `JWT_SECRET` to at least 32 random characters in `.env`. For example, generate a value with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`; keep the output private. Session tokens are stored in HttpOnly, SameSite cookies and are not exposed to browser JavaScript. Public registration always creates a standard user; the submitted role is ignored.

The first super administrator is created through `POST /api/auth/bootstrap-admin`. Set a long random `ADMIN_BOOTSTRAP_KEY` in `.env`, then send it in the `x-admin-bootstrap-key` header with a JSON body containing `name`, `email`, and `password`. This endpoint can succeed only once. Remove `ADMIN_BOOTSTRAP_KEY` from `.env` after the initial administrator has been created.

Password recovery requires SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`). Without SMTP configuration, the API returns `503` rather than pretending to send a reset email.

Auth endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, and `POST /api/auth/reset-password`.

Run auth tests with `npm test -w server`. The Mongo-backed session test uses a unique temporary account and removes it afterward; it is skipped when `MONGODB_URI` is unset.

## Production deployment

The deployment templates target Vercel + Render + MongoDB Atlas + S3:

- Frontend: deploy the `client/` app to Vercel.
- Backend: deploy the `server/` app to Render or another Node host.
- Database: use MongoDB Atlas for persistent auth, document, QR, and analytics data.
- Storage: use S3-compatible object storage for uploaded PDFs in production (`STORAGE_PROVIDER=s3`).

Recommended production environment settings:

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=https://your-frontend.vercel.app
PUBLIC_APP_URL=https://your-frontend.vercel.app
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/smartqr
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_BOOTSTRAP_KEY=replace-with-a-one-time-bootstrap-secret
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@example.com
STORAGE_PROVIDER=s3
AWS_REGION=us-east-1
S3_BUCKET=smartqr-documents
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

Before deploying, replace `https://smartqr-api.onrender.com` in `vercel.json` with the actual Render service URL. Set `CLIENT_URL` and `PUBLIC_APP_URL` in the Render service to the actual Vercel production URL. Configure the secrets in the host dashboards; do not commit them. After creating the first super administrator through the bootstrap endpoint, remove `ADMIN_BOOTSTRAP_KEY` from the Render service environment and redeploy. Verify `/api/health`, registration/login cookies, PDF upload and viewing, QR redirects, and password recovery on the deployed domains.

## Implementation status

Implemented: authentication, PDF management and access policies, dynamic URLs and QR codes, the public PDF viewer, scan analytics, deployment templates, and automated server integration tests.

Remaining before production launch:

- Create the Vercel and Render services, then replace the sample frontend/API hostnames in the deployment configuration.
- Provision MongoDB Atlas, S3-compatible storage, and SMTP; configure their production credentials in the hosting dashboards.
- Bootstrap the initial super administrator, remove the one-time bootstrap key, and verify production workflows and cookie/CORS behavior.
- Decide whether an admin management UI and audit-log viewing are in launch scope. The project has an `ActivityLog` model, but does not currently expose an admin or audit-log interface/API.