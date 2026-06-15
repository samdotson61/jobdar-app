// Bundled sample data so the three-tab UX is fully clickable with no live scan + no model.
// (PII-free fictional persona; real upload→parse is Milestone 9.2, live scan is 9.1.)
import type { Job } from './engine';

export const SAMPLE_CV = `Jordan Rivera
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
B.A. Anthropology, University of Cincinnati (2025)`;

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
];
