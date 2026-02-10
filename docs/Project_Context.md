# FundsIndia RNR Dashboard - Project Context

**Project Name:** RNR (Rewards & Recognition) Dashboard / Sales Contest Dashboard
**Client:** FundsIndia
**Project Start Date:** February 9, 2026
**Version:** 1.0.0
**Last Updated:** February 9, 2026

---

## Project Overview

The RNR Dashboard is a comprehensive Sales Contest and Performance Tracking System designed for FundsIndia's sales organization across three business verticals: B2B, B2C (Digital), and Private Wealth (PW). The system provides real-time visibility into sales performance, rankings, and achievements against targets for all levels of the organization.

### Primary Objectives

1. **Performance Visibility:** Provide real-time access to individual and team performance metrics
2. **Contest Management:** Enable running sales contests with configurable periods and parameters
3. **Hierarchical Views:** Show performance data based on reporting hierarchy with drill-down capabilities
4. **Leaderboards:** Display rankings within verticals to drive competitive motivation
5. **Admin Control:** Centralized data upload and contest configuration by admins
6. **Mobile Access:** Full-featured responsive design for mobile users

---

## Stakeholders

### Primary Users

1. **Relationship Managers (RMs) / IFAs:**
   - Individual contributors in sales roles
   - View personal performance and rankings
   - Access leaderboards to see peer performance

2. **Branch Managers (BM):**
   - Manage team of RMs at branch level
   - View aggregated team performance
   - Drill down to individual RM metrics

3. **Regional Managers (RGM):**
   - Manage multiple branch managers
   - View regional performance aggregations
   - Access to entire regional hierarchy

4. **Zonal Managers (ZM):**
   - Manage multiple regions
   - View zonal performance aggregations
   - Access to entire zone hierarchy

5. **Business CEOs:**
   - B2B CEO, B2C CEO, PW CEO
   - Full visibility into their respective vertical
   - Admin-like access for their vertical
   - Contest configuration for their vertical

6. **Group CEO:**
   - Akshay Sapru - heads all three verticals
   - Cross-vertical visibility
   - Strategic dashboard access
   - Full system visibility

7. **Admin:**
   - Employee ID: W2661
   - Full system access
   - Data upload responsibilities
   - User management
   - System configuration

8. **Product Team:**
   - Monitoring system performance
   - Gathering feedback for improvements
   - Analytics on usage patterns

---

## Business Context

### Current Challenge

FundsIndia's sales organization lacks a unified platform to:
- Track real-time performance across verticals
- Run structured sales contests
- Provide visibility into hierarchical team performance
- Generate competitive motivation through rankings
- Give managers tools to monitor team effectiveness

### Solution

A centralized web dashboard that:
- Aggregates daily sales data uploads
- Calculates rankings automatically
- Provides role-based views of performance data
- Enables contest configuration and management
- Logs all activities for audit purposes
- Works seamlessly on mobile devices

---

## Key Success Metrics

1. **User Adoption:** 80%+ of eligible employees log in weekly
2. **Data Accuracy:** 99%+ accuracy in ranking calculations
3. **Performance:** Dashboard loads in < 3 seconds
4. **Uptime:** 99.5% availability during business hours
5. **Mobile Usage:** 40%+ of traffic from mobile devices
6. **Engagement:** Average 5+ logins per user per week

---

## Technical Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Users (Web/Mobile)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Vercel (Hosting)                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Next.js 14 Application                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│  │
│  │  │ Auth Layer   │  │  Dashboard   │  │ Admin Panel  ││  │
│  │  │ (NextAuth)   │  │  Pages       │  │              ││  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘│  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│  │
│  │  │ API Routes   │  │  Components  │  │  Utils       ││  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘│  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Supabase Client
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (Backend)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Database                       │  │
│  │  • employees          • sales_data                     │  │
│  │  • users              • advisory_data                  │  │
│  │  • targets            • rankings                       │  │
│  │  • contest_config     • activity_logs                  │  │
│  │  • reporting_history                                   │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Database Functions                        │  │
│  │  • get_employee_hierarchy()                            │  │
│  │  • calculate_rankings()                                │  │
│  │  • get_team_aggregate()                                │  │
│  │  • upsert_sales_data()                                 │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Row Level Security (RLS)                      │  │
│  │  • Hierarchy-based access control                      │  │
│  │  • Role-based permissions                              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack Details

#### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (Radix UI primitives)
- **Charts:** Recharts
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Date Handling:** date-fns

#### Backend
- **Database:** Supabase (PostgreSQL)
- **Authentication:** NextAuth.js
- **API:** Next.js API Routes
- **File Parsing:** xlsx library

#### DevOps
- **Hosting:** Vercel
- **Version Control:** GitHub
- **CI/CD:** Vercel automatic deployments
- **Domain:** FundsIndia.OrgMIS.com
- **SSL:** Automatic via Vercel

---

## Tech Stack Rationale

### Why Next.js 14?
- **Server Components:** Improved performance with RSC
- **App Router:** Better routing and layouts
- **API Routes:** Backend logic without separate server
- **SSR/SSG:** SEO and performance optimization
- **Vercel Integration:** Seamless deployment
- **TypeScript Support:** Built-in type safety

### Why Supabase?
- **PostgreSQL:** Robust relational database
- **Real-time:** Built-in real-time subscriptions (future use)
- **Authentication:** Integrated auth system
- **Row Level Security:** Database-level security
- **Functions:** Stored procedures for complex logic
- **Free Tier:** Generous free tier for development
- **Backup:** Automatic backups

### Why Vercel?
- **Edge Network:** Fast global delivery
- **Zero Config:** Deploy with git push
- **Automatic HTTPS:** Built-in SSL
- **Preview Deployments:** Branch previews
- **Analytics:** Built-in web analytics
- **Next.js Optimized:** Built by Next.js creators

### Why shadcn/ui?
- **Customizable:** Copy-paste components
- **Type-Safe:** Full TypeScript support
- **Accessible:** Built on Radix UI
- **No Bundle Size:** Only components used
- **Tailwind Native:** Perfect integration
- **Modern Design:** Premium look and feel

---

## Data Sources

### Daily Upload Files

1. **Employee Master**
   - File: `Employee Master as on [DATE].xlsx`
   - Contains: All employee details and reporting structure
   - Frequency: Daily (may change infrequently)
   - Columns: Employee Number, Name, Email, Role, Manager, etc.

2. **Net Sales (B2B)**
   - File: `Final Net Sales [MONTH][YEAR].xlsx`
   - Sheets:
     - `[Month]` - MTD data for current month
     - `YTD(Apr[YY]-Dec[YY])` - Year-to-date April to December
   - Contains: Sales data by ARN/Partner with RM hierarchy
   - Frequency: Daily
   - Key Metrics: Net Sales (COB 100%), MF AUM, Revenue

3. **Advisory MIS (B2C/Digital)**
   - File: `Advisory MIS -FY'[YY].csv`
   - Contains: B2C advisor performance metrics
   - Frequency: Daily
   - Key Metrics: AUM, Inflows, Outflows, SIP data

### Data Processing Flow

```
Daily Upload (Admin)
    ↓
Excel Parser (Validation)
    ↓
Data Transformation
    ↓
Upsert to Database (Replace existing period data)
    ↓
Create Placeholder Employees (if needed)
    ↓
Update B2B Hierarchy (from Net Sales file)
    ↓
Calculate Rankings (trigger function)
    ↓
Update Rankings Table
    ↓
Dashboard Refresh (auto within 5 min)
```

---

## Business Rules

### 1. Hierarchy Management

**B2B Vertical:**
- Hierarchy extracted from Net Sales file columns: RM → BM → RGM → ZM
- Sales file hierarchy takes precedence over Employee Master for B2B
- Updates daily with sales data upload

**B2C and PW Verticals:**
- Hierarchy from Employee Master file
- Uses `reporting_manager_emp_number` field
- Single reporting line (no dotted line reporting)

**Special Cases:**
- If sales data has employees not in Employee Master → Create placeholder records
- If manager changes → Update reporting_history table with effective dates
- Historical data always shows under the employee's manager at that time

### 2. Ranking Logic

**Criteria:**
- Primary: Net Sales (total_net_sales_cob_100) - Descending
- Tie-breaker 1: Achievement % - Descending
- Tie-breaker 2: Employee Number - Ascending

**Scope:**
- Rankings are vertical-specific only
- No cross-vertical organization-wide rankings
- Separate leaderboards for B2B, B2C, PW

**Periods:**
- MTD (Month-to-Date)
- QTD (Quarter-to-Date) - For Q4: Jan 1 to current date
- YTD (Year-to-Date) - Apr 1 to current date
- Contest Period - Configurable (default: Q4 = Jan 1 - Mar 31, 2026)

### 3. Target Management

**Target Setting:**
- Individual employee level (not role/branch/zone based)
- Separate targets for each period: Monthly, Quarterly, Yearly, Contest
- Each parameter has its own target: Net Sales, AUM, Revenue

**Target Sources:**
- Admin upload (targets file)
- Manual entry by admin/CEO
- Auto-generated sample targets (for testing)

**Calculations:**
- Achievement % = (Actual / Target) × 100
- Shortfall = Target - Actual
- Status: On Track (≥90%), At Risk (70-89%), Behind (<70%)

### 4. Team Aggregation

**Calculation Method:**
- Team Total = Manager's Individual Performance + Sum of All Downstream Reportees
- Recursive aggregation down the entire hierarchy tree

**Display:**
- Show breakdown: "Your contribution: X | Team contribution: Y | Total: Z"
- Color coding: Self (blue), Team (green)
- Toggle between Self view and Team view

### 5. Access Control

**Role Hierarchy:**
```
Admin (W2661)
    ↓
Group CEO (Akshay Sapru)
    ↓
Business CEOs (B2B CEO | B2C CEO | PW CEO)
    ↓
Zonal Managers
    ↓
Regional Managers
    ↓
Branch Managers
    ↓
Relationship Managers / IFAs
```

**Access Rules:**
- Users can view their own data + all downstream reportees
- Admins can view all data across all verticals
- CEOs can view their vertical only (+ admin powers for their vertical)
- Group CEO can view all verticals
- Activity logs visible to upper hierarchy

### 6. Data Retention

**Current Approach:**
- Keep only latest MTD/QTD/YTD values
- Replace existing data on each upload (upsert strategy)
- No historical daily snapshots (to save storage)

**Activity Logs:**
- Retain for 1 year
- Archive older logs

**Rankings:**
- Recalculate on every data upload
- Store only current rankings

---

## Security & Privacy

### Authentication
- Email/password authentication via NextAuth.js
- Email domain restriction: Only @fundsindia.com emails
- Strong password policy (min 8 chars, 1 uppercase, 1 number, 1 special)
- First login forces password change
- Password reset via email

### Authorization
- Row Level Security (RLS) in Supabase
- Role-based access control (RBAC)
- Hierarchy-based data filtering
- API route middleware for role verification

### Data Security
- HTTPS only (enforced by Vercel)
- Password hashing with bcrypt
- Environment variables for secrets
- No sensitive data in client-side code
- SQL injection prevention via Supabase client

### Activity Logging
- Log all user actions (login, view, upload, etc.)
- Log admin actions with details
- IP address and user agent tracking
- Logs visible to upper hierarchy for audit

### Compliance
- No PII exposure in public endpoints
- Access logs for audit purposes
- Data access tied to organizational hierarchy
- Admin actions are traceable

---

## Performance Requirements

### Response Times
- Dashboard initial load: < 3 seconds
- API responses: < 500ms
- Data upload processing: < 30 seconds for typical file
- Ranking calculation: < 10 seconds after upload

### Scalability
- Support 1,500+ employees
- Handle 5,000+ sales records per upload
- Support 500+ concurrent users
- Store 12 months of activity logs

### Availability
- 99.5% uptime during business hours (9 AM - 9 PM IST)
- Planned maintenance outside business hours
- Automatic backups (Supabase daily backups)

### Mobile Performance
- Works on 3G networks
- Optimized images and assets
- Lazy loading for large datasets
- Touch-optimized controls

---

## Development Approach

### Methodology
- **Agile approach:** Iterative development in 2-day sprints
- **Incremental delivery:** Working features at end of each phase
- **Test-driven:** Test critical functions before integration
- **Documentation:** Context files maintained throughout

### Code Standards
- **TypeScript:** Strict mode enabled
- **ESLint:** Enforce code quality
- **Prettier:** Consistent formatting
- **Naming:** camelCase for variables, PascalCase for components
- **Comments:** Document complex logic
- **Modular:** DRY principle, reusable components

### Git Workflow
```
main (production)
  ↓
develop (staging)
  ↓
feature/* (feature branches)
```

### Testing Strategy
- **Unit Tests:** Utils and business logic functions
- **Integration Tests:** API routes
- **E2E Tests:** Critical user flows (login, view dashboard, upload)
- **Manual Testing:** UI/UX validation

---

## Deployment Strategy

### Environments

1. **Development (Local)**
   - Local Next.js dev server
   - Supabase development project
   - Hot reload enabled

2. **Staging (Vercel Preview)**
   - Preview deployment on feature branches
   - Supabase staging database
   - Used for testing before production

3. **Production (Vercel)**
   - Main branch auto-deploys to production
   - Supabase production database
   - Custom domain: FundsIndia.OrgMIS.com

### Deployment Process
1. Develop on feature branch
2. Create pull request
3. Vercel creates preview deployment
4. Test on preview URL
5. Merge to main
6. Vercel auto-deploys to production
7. Smoke tests on production

### Rollback Strategy
- Vercel instant rollback to previous deployment
- Database migrations versioned with timestamps
- Manual rollback for database if needed

---

## Future Enhancements (Roadmap)

### Phase 2 (Q2 2026)
- **Real-time Updates:** WebSocket for live ranking updates
- **Notifications:** Email/WhatsApp alerts for rank changes
- **Export Reports:** PDF/Excel export of performance reports
- **Advanced Analytics:** Trend analysis, predictive insights

### Phase 3 (Q3 2026)
- **Mobile App:** React Native iOS/Android apps
- **Gamification:** Badges, achievements, streaks
- **Peer Comparison:** Compare with similar peers
- **Goal Setting:** Employees can set personal goals

### Phase 4 (Q4 2026)
- **HR Integration:** Auto-sync employee data from HR system
- **Rewards Module:** Contest rewards and redemption
- **Video Recognition:** CEO video messages for top performers
- **Historical Trends:** Year-over-year comparison

### Backlog
- Multi-language support (Hindi, Tamil, etc.)
- Voice navigation
- Offline mode for mobile
- Integration with CRM systems
- Advanced data visualization (heat maps, geo maps)

---

## Risk Management

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Supabase outage | High | Implement caching, use Vercel Edge Functions fallback |
| Data upload failures | Medium | Validation before upload, rollback capability |
| Ranking calculation errors | High | Extensive unit tests, manual verification |
| Performance degradation | Medium | Database indexing, query optimization |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Low user adoption | High | Training sessions, user guides, support |
| Data accuracy concerns | High | Rigorous testing, manual audit process |
| Hierarchy changes | Medium | Historical tracking, easy updates |
| Contest disputes | Medium | Clear rules documentation, activity logs |

---

## Support & Maintenance

### Support Channels
- **Primary:** Internal support team
- **Email:** rnr-support@fundsindia.com (to be created)
- **Documentation:** User guides in dashboard
- **Training:** Video tutorials and live sessions

### Maintenance Windows
- **Scheduled:** Sundays 2 AM - 6 AM IST
- **Emergency:** Notify users via email/banner
- **Updates:** Deploy outside business hours

### Monitoring
- **Uptime:** Vercel analytics
- **Errors:** Sentry error tracking (future)
- **Performance:** Vercel Speed Insights
- **Usage:** Google Analytics (future)

---

## Success Criteria

### MVP Launch (End of Phase 8)
- ✅ All employees can log in with @fundsindia.com email
- ✅ Dashboard shows accurate performance metrics
- ✅ Rankings calculated correctly for all verticals
- ✅ Leaderboard displays and filters work
- ✅ Admin can upload all three data files
- ✅ Mobile responsive and functional
- ✅ Activity logging captures all actions

### 1 Month Post-Launch
- 80% of eligible employees have logged in
- < 5 support tickets per week
- Data upload success rate > 95%
- Average rating > 4/5 from user feedback

### 3 Months Post-Launch
- 90% of employees active users
- Contest participation > 85%
- Performance improvement correlation with dashboard usage
- Feature requests prioritized for Phase 2

---

## Contact & Ownership

### Project Team
- **Project Sponsor:** Akshay Sapru (Group CEO)
- **Product Owner:** Product Team
- **Tech Lead:** [To be assigned]
- **Development:** Claude + Human Developer
- **Admin:** Employee W2661

### Stakeholder Communication
- **Weekly Updates:** Email to Group CEO and CEOs
- **Monthly Demo:** Product team and stakeholders
- **Feedback Loop:** Continuous via in-app feedback form

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-09 | Claude | Initial project context document |

---

**End of Project Context Document**
