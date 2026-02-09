# RNR Dashboard - FundsIndia

Sales Contest and Performance Tracking Dashboard for FundsIndia's B2B, B2C, and Private Wealth divisions.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL)
- **Authentication:** NextAuth.js
- **Deployment:** Vercel

## Project Structure

```
rnr-dashboard/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard pages
│   ├── admin/             # Admin panel
│   └── login/             # Login page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/        # Dashboard components
│   ├── leaderboard/      # Leaderboard components
│   ├── admin/            # Admin components
│   └── charts/           # Chart components
├── lib/                   # Utility libraries
│   ├── supabase.ts       # Supabase client
│   └── utils.ts          # Utility functions
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript types
└── utils/                 # Business logic utilities
```

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd rnr-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials.

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Environment Variables

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (keep secret!)
- `NEXTAUTH_URL`: Application URL
- `NEXTAUTH_SECRET`: NextAuth secret key

## Deployment

This project is configured for deployment on Vercel:

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

## Documentation

See the context files in the parent directory for detailed documentation:

- `Project_Context.md` - Project overview and architecture
- `database_supabase_context.md` - Database schema and queries
- `Contest_logic_Context.md` - Ranking and contest logic
- `Employee_Reporting_context.md` - Hierarchy and reporting logic

## License

Private - FundsIndia Internal Use Only
