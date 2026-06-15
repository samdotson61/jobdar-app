// Bundled sample data so the three-tab UX is fully clickable with no live scan + no model.
// (PII-free fictional personas; real upload→parse is Milestone 9.2, live scan is 9.1.)
import type { Job } from './engine';

export interface Resume { name: string; text: string }

// "Load a sample" cycles through these so each click brings a *different* persona — handy for seeing how
// scoring shifts across backgrounds.
export const SAMPLE_RESUMES: Resume[] = [
  {
    name: 'Jordan Rivera',
    text: `Jordan Rivera
Columbus, OH · entry-level · open to Midwest / remote

SUMMARY
Recent grad moving into data + operations. Built dashboards and ran A/B tests during a marketing
internship; comfortable with SQL, Python, and spreadsheets. Research-first, fast learner.

EXPERIENCE
Marketing Intern — Brightside Co (2025)
- Built weekly KPI dashboards in SQL + Looker; ran A/B tests that lifted email engagement 12%.
- Coordinated a 3-person content sprint; wrote the reporting playbook.
Operations Assistant — Campus Store (2024)
- Streamlined inventory tracking; cut stockouts with a simple reorder process.

SKILLS
SQL · Python · Excel · Looker · A/B testing · communication · stakeholder updates · agile

EDUCATION
B.A. Anthropology, University of Cincinnati (2025)`,
  },
  {
    name: 'Maya Chen',
    text: `Maya Chen
Chicago, IL · entry-level · marketing & content

SUMMARY
Creative communicator breaking into marketing. Ran a campus social account to 8k followers, wrote
newsletters, and coordinated events. Strong writing, organization, and campaign instincts.

EXPERIENCE
Content & Social Intern — Lakeshore Media (2025)
- Planned and wrote a weekly newsletter; grew open rate from 18% to 27%.
- Coordinated 5 campus events end to end, partnering with vendors and student groups.
Sales Associate — Northside Outfitters (2023–2024)
- Top-three seller; trained two new hires on the floor playbook.

SKILLS
copywriting · social media · campaign coordination · communication · Canva · spreadsheets · events

EDUCATION
B.A. Communications, DePaul University (2025)`,
  },
  {
    name: 'Devon Brooks',
    text: `Devon Brooks
Remote (Midwest) · mid-level · customer success

SUMMARY
Customer-success associate with 3 years supporting SaaS users. Onboarded accounts, cut churn, and
turned feedback into roadmap input. Calm, organized, great with people and process.

EXPERIENCE
Customer Success Associate — Helmway (2022–2025)
- Owned onboarding for 120+ accounts; lifted 90-day retention 14 points.
- Built a feedback pipeline that fed 30+ items into the product backlog.
Support Specialist — Helmway (2021–2022)
- Cut average resolution time 40% with a new troubleshooting guide.

SKILLS
onboarding · retention · communication · CRM (HubSpot) · spreadsheets · stakeholder updates · QBRs

EDUCATION
B.S. Business, Indiana University (2021)`,
  },
  {
    name: 'Sofía Reyes',
    text: `Sofía Reyes
Cincinnati, OH · entry-level · finance / operations · bilingüe (EN/ES)

SUMMARY
Detail-driven grad entering finance/operations. Reconciled accounts during an internship, built
budget trackers, and supported month-end close. Bilingual English/Spanish.

EXPERIENCE
Finance Intern — Queensgate Partners (2025)
- Reconciled vendor accounts and helped close the books each month with zero variances.
- Built an Excel budget tracker adopted by a 6-person team.
Bookkeeping Assistant — Familia Market (2023–2024)
- Managed invoices and weekly cash reports for a small family business.

SKILLS
Excel · reconciliation · budgeting · accounts payable · QuickBooks · communication · español

EDUCATION
B.B.A. Accounting, University of Cincinnati (2025)`,
  },
  {
    name: 'Aiden Park',
    text: `Aiden Park
Indianapolis, IN · entry-level · software / IT support

SUMMARY
Self-taught developer + IT support tech. Built small web apps, automated tickets with scripts, and
supported 200+ users. Comfortable with Python, JavaScript, and SQL.

EXPERIENCE
IT Support Technician — Crossroads Logistics (2024–2025)
- Resolved 1,500+ tickets; wrote PowerShell scripts that cut imaging time 60%.
- Built a small internal dashboard (JavaScript + SQL) for asset tracking.
Freelance Web Projects (2022–2024)
- Shipped three client sites; handled hosting, forms, and basic SEO.

SKILLS
Python · JavaScript · SQL · PowerShell · REST APIs · troubleshooting · Git · documentation

EDUCATION
A.S. Information Technology, Ivy Tech (2024)`,
  },
];

export const SAMPLE_CV = SAMPLE_RESUMES[0].text; // back-compat default

export const SAMPLE_JOBS: Job[] = [
  {
    company: 'Enova', role: 'Marketing Coordinator', location: 'Chicago, IL (Hybrid)',
    url: 'https://job-boards.greenhouse.io/enova/jobs/0000001', postedOn: '3 days ago',
    jd: `We are hiring a Marketing Coordinator to run campaigns, analyze engagement, and support A/B testing.
You will build weekly KPI dashboards, partner with content, and report results to stakeholders.
Requirements: strong communication, comfort with SQL and spreadsheets, data-informed mindset. Entry level
welcome. Pay $52,000–$60,000.`,
  },
  {
    company: 'Civis Analytics', role: 'Operations Analyst', location: 'Columbus, OH',
    url: 'https://job-boards.greenhouse.io/civis/jobs/0000002', postedOn: '1 week ago',
    jd: `Operations Analyst to streamline internal processes, track KPIs, and improve reporting. SQL and Excel
required; Python a plus. You will own dashboards and partner cross-functionally. 1+ years experience.
$58,000–$68,000.`,
  },
  {
    company: 'Relativity Space', role: 'Senior Data Engineer', location: 'Long Beach, CA',
    url: 'https://job-boards.greenhouse.io/relativity/jobs/0000003', postedOn: '5 days ago',
    jd: `Senior Data Engineer. Build large-scale pipelines in Spark and Airflow. Requires 8+ years of
data engineering and an active security clearance. Bachelor's in CS required.`,
  },
  {
    company: 'Greenlight', role: 'Customer Success Associate', location: 'Remote (US-Midwest)',
    url: 'https://job-boards.greenhouse.io/greenlight/jobs/0000004', postedOn: '2 days ago',
    jd: `Customer Success Associate to onboard users, answer questions, and gather product feedback. Strong
communication and organization; comfort with basic spreadsheets. Entry level. $45,000–$52,000.`,
  },
  {
    company: 'Fifth Third Bank', role: 'CRA Loan Specialist', location: 'Dearborn, MI',
    url: 'https://fifththird.wd5.myworkdayjobs.com/53careers/job/0000005', postedOn: '3 weeks ago',
    jd: `CRA Loan Specialist to process community-reinvestment loans, verify documentation, and ensure
compliance. Requires 5+ years in mortgage lending and a finance degree.`,
  },
  {
    company: 'Loop Returns', role: 'Junior Accountant', location: 'Columbus, OH (Hybrid)',
    url: 'https://job-boards.greenhouse.io/loop/jobs/0000006', postedOn: '4 days ago',
    jd: `Junior Accountant to support month-end close, reconcile accounts, and maintain budget trackers in
Excel. QuickBooks experience a plus. Entry level welcome. $50,000–$58,000.`,
  },
];
