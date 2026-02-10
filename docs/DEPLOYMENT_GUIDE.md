# RNR Dashboard - Deployment Guide

## Current Status ✅

### Completed
1. ✅ All context files created (Project, Database, Contest Logic, Employee Reporting)
2. ✅ Supabase database setup complete (all tables, indexes, functions, RLS policies)
3. ✅ Next.js project structure created
4. ✅ Configuration files ready (package.json, tsconfig.json, tailwind.config.ts, etc.)
5. ✅ Basic folder structure and initial files created

### Project Location
```
/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard/
```

---

## Next Steps: Deploy to Vercel

Since Node.js is not installed locally, we'll push directly to GitHub and deploy via Vercel.

### Step 1: Initialize Git Repository

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard"
git init
git add .
git commit -m "Initial commit: RNR Dashboard project setup

- Added Next.js 14 configuration
- Setup Tailwind CSS and TypeScript
- Created folder structure
- Added Supabase integration
- Configured for Vercel deployment"
```

### Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `rnr-dashboard`
3. Description: "FundsIndia RNR Sales Contest Dashboard"
4. Set to **Private**
5. Do NOT initialize with README (we already have one)
6. Click "Create repository"

### Step 3: Push to GitHub

After creating the repository, run these commands:

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard"
git remote add origin https://github.com/YOUR_USERNAME/rnr-dashboard.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

### Step 4: Deploy to Vercel

#### Option A: Vercel Dashboard (Recommended)

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your GitHub account and find `rnr-dashboard`
4. Click "Import"
5. Configure project:
   - **Framework Preset:** Next.js
   - **Root Directory:** ./
   - **Build Command:** `npm run build`
   - **Output Directory:** .next
6. Add Environment Variables (click "Environment Variables"):

```
NEXT_PUBLIC_SUPABASE_URL=https://pgomungsynwbqwcwskly.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<get from Supabase Dashboard → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase Dashboard → Settings → API>
NEXTAUTH_URL=https://your-app.vercel.app (will be provided after first deploy)
NEXTAUTH_SECRET=<generate using: openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

7. Click "Deploy"
8. Wait for build to complete (~2-3 minutes)
9. Get your deployment URL (e.g., `rnr-dashboard-abc123.vercel.app`)
10. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` with your actual Vercel URL

#### Option B: Vercel CLI

If you have Vercel CLI installed:

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard"
vercel
```

Follow the prompts to deploy.

---

## Get Supabase API Keys

1. Go to your Supabase Dashboard: https://pgomungsynwbqwcwskly.supabase.co
2. Click on **Settings** (gear icon in left sidebar)
3. Click on **API**
4. Copy these values:
   - **Project URL** → Use for `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → Use for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** key → Use for `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this SECRET!

---

## Generate NEXTAUTH_SECRET

### On macOS/Linux:
```bash
openssl rand -base64 32
```

### Or use online generator:
Go to https://generate-secret.vercel.app/32

Copy the generated secret and use it for `NEXTAUTH_SECRET`.

---

## Custom Domain Setup (Optional)

To use `FundsIndia.OrgMIS.com`:

1. In Vercel Dashboard, go to your project
2. Click "Settings" → "Domains"
3. Add custom domain: `fundsindia.orgmis.com`
4. Follow Vercel's instructions to update DNS records:
   - Add CNAME record pointing to your Vercel deployment
   - Wait for DNS propagation (5-10 minutes)
5. Vercel will automatically provision SSL certificate

---

## Post-Deployment Verification

After deployment is complete:

1. ✅ Visit your Vercel URL
2. ✅ Check that the app loads (should redirect to /login)
3. ✅ Verify Supabase connection (check browser console for errors)
4. ✅ Test database connection by creating a test user

---

## Troubleshooting

### Build Fails on Vercel

**Issue:** TypeScript errors or missing dependencies

**Solution:**
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify package.json dependencies

### Database Connection Issues

**Issue:** Can't connect to Supabase

**Solution:**
- Verify SUPABASE_URL and ANON_KEY are correct
- Check Supabase project is active
- Verify RLS policies are not blocking connections

### Authentication Not Working

**Issue:** Can't log in or session errors

**Solution:**
- Verify NEXTAUTH_URL matches your deployment URL
- Ensure NEXTAUTH_SECRET is set
- Check NextAuth configuration

---

## Next Development Steps

Once deployed, you can continue development:

### On Local Machine (with Node.js)

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard"
npm install
npm run dev
```

### Or Continue via Vercel

Push changes to GitHub → Vercel auto-deploys

---

## Important Files Created

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `next.config.js` | Next.js configuration |
| `tailwind.config.ts` | Tailwind CSS configuration |
| `components.json` | shadcn/ui configuration |
| `.env.local.example` | Environment variables template |
| `lib/supabase.ts` | Supabase client setup |
| `lib/utils.ts` | Utility functions |
| `types/database.types.ts` | Database TypeScript types |

---

## Current Project State

```
✅ Database: Setup complete (9 tables, 4 functions, RLS enabled)
✅ Project Structure: Created with all necessary configs
✅ TypeScript: Configured with strict mode
✅ Tailwind CSS: Setup with custom theme
✅ Supabase: Client configured (needs env vars)
⏳ Authentication: NextAuth configured (needs implementation)
⏳ Dashboard: Structure ready (needs implementation)
⏳ Admin Panel: Structure ready (needs implementation)
⏳ Leaderboard: Structure ready (needs implementation)
```

---

## Support & Documentation

- **Context Files:** Check parent directory for detailed documentation
- **Supabase Dashboard:** https://pgomungsynwbqwcwskly.supabase.co
- **Vercel Dashboard:** https://vercel.com/dashboard
- **GitHub Repo:** (To be created)

---

**Last Updated:** February 9, 2026
