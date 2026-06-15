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
  { company: "Plante Moran", role: "Staff Accountant", location: "Cincinnati, OH", url: "https://www.plantemoran.com/careers", jd: "Staff Accountant to support audit and tax engagements, prepare financial statements, reconcile accounts, and assist month-end close. Active CPA license required (or CPA-eligible, exam completed within 12 months). Bachelor’s in Accounting required. Public accounting experience a plus." },
  { company: "relativity", role: "Accounting Manager", location: "Long Beach, California", url: "https://boards.greenhouse.io/relativity/jobs/8569889002?gh_jid=8569889002", jd: "At Relativity Space, we’re building rockets to serve today’s needs and tomorrow’s breakthroughs. Our Terran R vehicle will deliver customer payloads to orbit, meeting the growing demand for launch capacity. But that’s just the start. Achieving commercial success with Terran R will unlock new opportunities to advance science, exploration, and innovation, pioneering progress that reaches beyond the known. Joining Relativity means becoming part of something where autonomy, ownership, and impact exist at every level. Here, you're not just executing tasks; you're solving problems that haven’t been solved before, helping develop a rocket, a factory, and a business from the ground up. Whether you’re in propulsion, man" },
  { company: "enova", role: "Business Compliance Associate", location: "Chicago, IL", url: "https://job-boards.greenhouse.io/enova/jobs/7894462", jd: "We are interested in every qualified candidate who is eligible to work in the United States. However, we are not able to sponsor visas or take over sponsorship at this time. About the Role: As a Business Operations Associate within the NetCredit Business Unit, you will serve as a strategic architect of our operational integrity. You will be responsible for the design, oversight, and continuous maintenance of a comprehensive controls inventory across our diverse product portfolio. By synthesizing customer feedback and production data, you will lead cross-functional gap assessments to proactively identify risks before they impact the business and enhance operational resiliency. You'll collaborate cross-functional" },
  { company: "enova", role: "Collections Support Specialist (Hybrid)", location: "Denver, CO", url: "https://job-boards.greenhouse.io/enova/jobs/7746053", jd: "We are interested in every qualified candidate who is eligible to work in the United States. However, we are not able to sponsor visas or take over sponsorship at this time. #BI-Hybrid #LI-Hybrid About the role: As a Collections Support Specialist I, you will work as a vital member across the Small Business Payment Support P&L’s as you facilitate the team’s ability to protect and collect on our portfolios. You will work with the leadership of the Small Business Collection’s teams to ensure daily, weekly and monthly tasks are completed in a timely and accurate manner. Additionally, you will work with several departments to execute processes while constantly looking to build efficiencies and best practices. Respo" },
  { company: "sproutsocial", role: "Senior Director, Financial Planning and Analysis (GTM)", location: "Remote US", url: "https://sproutsocial.com/careers/open-positions/7918246/?gh_jid=7918246", jd: "Description Sprout Social is looking to hire a Senior Director, FP&A (GTM) to join the Finance team. This is a senior leadership role at the center of Sprout’s go-to-market financial strategy, responsible for driving rigorous planning, executive-level insight, and scalable processes across a large and complex business. Why join Sprout’s Finance team? As a member of Sprout’s Finance team, you’ll help position Sprout for continued growth while maintaining the highest standards of financial rigor and operational excellence. Our team plays a critical role in shaping company strategy, partnering closely with executive leadership to guide investment decisions and drive sustainable growth. We value transparency, owner" },
  { company: "sproutsocial", role: "Senior Finance Manager, Corporate and G&A", location: "Remote US", url: "https://sproutsocial.com/careers/open-positions/7979727/?gh_jid=7979727", jd: "Description Sprout Social is looking to hire a Senior Finance Manager, Corporate and G&A, for the Finance team. Why join Sprout’s Finance team? At Sprout Social, our Finance team powers the strategy behind helping leading brands unlock the value of social intelligence. We act as the company’s fiscal backbone—equipping leaders with insights to make smart decisions, while delivering a seamless experience for customers and meeting the demands of a dynamic public company. You'll join a collaborative team grounded in accuracy and operational excellence, where your work directly impacts Sprout's success. We foster a culture of high standards and continuous learning, giving you the opportunity to grow your expertise w" },
  { company: "relativity", role: "AI/ML Scientist, Planetary Science", location: "Long Beach, California", url: "https://boards.greenhouse.io/relativity/jobs/8561541002?gh_jid=8561541002", jd: "At Relativity Space, we’re building rockets to serve today’s needs and tomorrow’s breakthroughs. Our Terran R vehicle will deliver customer payloads to orbit, meeting the growing demand for launch capacity. But that’s just the start. Achieving commercial success with Terran R will unlock new opportunities to advance science, exploration, and innovation, pioneering progress that reaches beyond the known. Joining Relativity means becoming part of something where autonomy, ownership, and impact exist at every level. Here, you're not just executing tasks; you're solving problems that haven’t been solved before, helping develop a rocket, a factory, and a business from the ground up. Whether you’re in propulsion, man" },
  { company: "sproutsocial", role: "Sr. Applied AI/ML Scientist ", location: "Remote Ireland", url: "https://sproutsocial.com/careers/open-positions/7861888/?gh_jid=7861888", jd: "Description NewsWhip by Sprout Social is looking for a Senior Applied AI/ML Scientist to join its AI, Data and Intelligence Business Unit. Why join NewsWhip by Sprout Social’s Data Science and AI team? Most LLM applications are wrappers around a chat box. Ours aren't. NewsWhip processes the world's news in real time - millions of articles, posts, and signals every day - and turns that firehose into predictive intelligence that journalists, PR leaders, and global brands rely on to make decisions before the news breaks. The interesting problems live everywhere in that pipeline: ambient agents that monitor and enrich content as it flows in, retrieval systems that have to be fast and correct on a corpus that change" },
  { company: "amount", role: "Production Support Engineer", location: "Chicago, IL", url: "https://job-boards.greenhouse.io/amount/jobs/5139732007", jd: "FIS® Amount™ provides a unified digital origination and decisioning platform that helps financial institutions meet the moment. Designed to scale with banks and credit unions at any stage of their digital journey, FIS® Amount™ delivers a seamless, digital-first experience—streamlining everything from loan origination to deposit account opening. With built-in fraud orchestration and risk management, FIS® Amount™ enables financial institutions to control risk across any product while optimizing performance and enhancing security. Our flexible, modular platform is backed by enterprise-grade infrastructure and compliance, allowing institutions to launch new offerings in months, not years. Learn more at www.fisgloba" },
  { company: "relativity", role: "Aerodynamics Engineer I", location: "Long Beach, California", url: "https://boards.greenhouse.io/relativity/jobs/8143970002?gh_jid=8143970002", jd: "At Relativity Space, we’re building rockets to serve today’s needs and tomorrow’s breakthroughs. Our Terran R vehicle will deliver customer payloads to orbit, meeting the growing demand for launch capacity. But that’s just the start. Achieving commercial success with Terran R will unlock new opportunities to advance science, exploration, and innovation, pioneering progress that reaches beyond the known. Joining Relativity means becoming part of something where autonomy, ownership, and impact exist at every level. Here, you're not just executing tasks; you're solving problems that haven’t been solved before, helping develop a rocket, a factory, and a business from the ground up. Whether you’re in propulsion, man" },
  { company: "relativity", role: "Aerothermal Engineer II", location: "Long Beach, California", url: "https://boards.greenhouse.io/relativity/jobs/8079493002?gh_jid=8079493002", jd: "At Relativity Space, we’re building rockets to serve today’s needs and tomorrow’s breakthroughs. Our Terran R vehicle will deliver customer payloads to orbit, meeting the growing demand for launch capacity. But that’s just the start. Achieving commercial success with Terran R will unlock new opportunities to advance science, exploration, and innovation, pioneering progress that reaches beyond the known. Joining Relativity means becoming part of something where autonomy, ownership, and impact exist at every level. Here, you're not just executing tasks; you're solving problems that haven’t been solved before, helping develop a rocket, a factory, and a business from the ground up. Whether you’re in propulsion, man" },
  { company: "relativity", role: "Avionics Production Supervisor, PCBA", location: "Long Beach, California", url: "https://boards.greenhouse.io/relativity/jobs/8490576002?gh_jid=8490576002", jd: "At Relativity Space, we’re building rockets to serve today’s needs and tomorrow’s breakthroughs. Our Terran R vehicle will deliver customer payloads to orbit, meeting the growing demand for launch capacity. But that’s just the start. Achieving commercial success with Terran R will unlock new opportunities to advance science, exploration, and innovation, pioneering progress that reaches beyond the known. Joining Relativity means becoming part of something where autonomy, ownership, and impact exist at every level. Here, you're not just executing tasks; you're solving problems that haven’t been solved before, helping develop a rocket, a factory, and a business from the ground up. Whether you’re in propulsion, man" },
  { company: "relativity", role: "Benchwork Technician II, Second Shift", location: "Long Beach, California", url: "https://boards.greenhouse.io/relativity/jobs/8477526002?gh_jid=8477526002", jd: "At Relativity Space, we’re building rockets to serve today’s needs and tomorrow’s breakthroughs. Our Terran R vehicle will deliver customer payloads to orbit, meeting the growing demand for launch capacity. But that’s just the start. Achieving commercial success with Terran R will unlock new opportunities to advance science, exploration, and innovation, pioneering progress that reaches beyond the known. Joining Relativity means becoming part of something where autonomy, ownership, and impact exist at every level. Here, you're not just executing tasks; you're solving problems that haven’t been solved before, helping develop a rocket, a factory, and a business from the ground up. Whether you’re in propulsion, man" },
  { company: "8451", role: "Director Data Science (P2415)", location: "Cincinnati, OH; Chicago, IL", url: "https://job-boards.greenhouse.io/8451/jobs/8476911002", jd: "84.51° Overview: 84.51° is a retail data science, insights and media company. We help The Kroger Co., consumer packaged goods companies, agencies, publishers and affiliates create more personalized and valuable experiences for shoppers across the path to purchase. Powered by cutting-edge science, we utilize first-party retail data from more than 62 million U.S. households sourced through the Kroger Plus loyalty card program to fuel a more customer-centric journey using 84.51° Insights, 84.51° Loyalty Marketing and our retail media advertising solution, Kroger Precision Marketing. 84.51° follows a 5‑day in‑office work schedule to support collaboration, alignment, and team connection. Join us at 84.51°! _________" },
  { company: "civisanalytics", role: "Applied Data Scientist (Contract)", location: "Remote", url: "https://job-boards.greenhouse.io/civisanalytics/jobs/7858970", jd: "Please note that candidates must currently live in the following states: DC, Florida, Illinois, Maryland, Michigan, North Carolina, New York, Pennsylvania, Texas, Vermont. Virginia The Applied Data Science (ADS) team is the consultancy arm of Civis Analytics, working closely with clients to help solve their toughest challenges with data science. Responsibilities An Applied Data Scientist is responsible for the end-to-end execution of new client engagements utilizing data science, which includes: Unifying large 1st- and 3rd-party datasets and building predictive models Deriving clear, actionable, and timely insights from analyses Creating client-ready materials and solutions for stakeholders of varying technical" },
  { company: "carvana", role: "Analytics Lead, Marketplaces Strategy", location: "Tempe, AZ", url: "https://www.carvana.com/careers/apply?gh_jid=7289305", jd: "About Carvana... At Carvana, we’re changing the way people buy and sell cars. With an ambitious vision and a fundamentally different approach designed to be fun, fast, and fair, Carvana became the fastest-growing automotive retailer in history. We expanded nationally, went public on the New York Stock Exchange, sold our 1 millionth car, and reached the Fortune 500, all in just eight years. Today, with 4 million retail customers and counting, Carvana is both the fastest-growing and the most profitable public automotive retailer, and we’re just getting started. We continue to raise the bar for our customers as we tackle the enormous opportunity still ahead in the largest consumer vertical. Working here means bein" },
  { company: "spothero", role: "Growth Manager II (Account Manager), Los Angeles ", location: "Los Angeles, CA", url: "https://spothero.com/careers/7913863/?gh_jid=7913863", jd: "Who we are: At SpotHero, we work as a team to empower people to get everywhere, easier! We’re rapidly growing with the mission of bringing the parking industry into the future through technology. Drivers across the nation use the SpotHero mobile app and website to reserve convenient, affordable parking in advance, on-the-go or through their connected cars, and parking companies rely on us to help them reach new customers while optimizing their business. We connect the dots with cutting-edge technology, delivering value to both sides of this exciting, evolving marketplace. We’ve been quite busy, take a peek at some of our recent announcements. Growth Manager II at SpotHero: A Growth Manager is responsible for ob" },
  { company: "spothero", role: "Growth Manager I/II (Account Manager), Boston", location: "Boston, Massachusetts", url: "https://spothero.com/careers/7416989/?gh_jid=7416989", jd: "Who we are: At SpotHero, we work as a team to empower people to get everywhere, easier! We’re rapidly growing with the mission of bringing the parking industry into the future through technology. Drivers across the nation use the SpotHero mobile app and website to reserve convenient, affordable parking in advance, on-the-go or through their connected cars, and parking companies rely on us to help them reach new customers while optimizing their business. We connect the dots with cutting-edge technology, delivering value to both sides of this exciting, evolving marketplace. We’ve been quite busy, take a peek at some of our recent announcements. Growth Manager I/II at SpotHero: A Growth Manager is responsible for " },
  { company: "spothero", role: "CRM Marketing Specialist ", location: "Chicago, Illinois, United States", url: "https://spothero.com/careers/7858825/?gh_jid=7858825", jd: "Who we are: At SpotHero, we work as a team to empower people to get everywhere, easier! We’re rapidly growing with the mission of bringing the parking industry into the future through technology. Drivers across the nation use the SpotHero mobile app and website to reserve convenient, affordable parking in advance, on-the-go or through their connected cars, and parking companies rely on us to help them reach new customers while optimizing their business. We connect the dots with cutting-edge technology, delivering value to both sides of this exciting, evolving marketplace. We’ve been quite busy, take a peek at some of our recent announcements. CRM Marketing Specialist at SpotHero: SpotHero is seeking a CRM Marke" },
  { company: "censys", role: "Product Marketing Manager", location: "Remote", url: "https://job-boards.greenhouse.io/censys/jobs/8541056002", jd: "Company Background Censys’ mission is to be the one place to understand everything on the internet. Frustrated by the lack of trustworthy Internet intelligence, we set out to create the industry’s most comprehensive, accurate, and up-to-date map of the Internet. Today, Censys delivers real-time Internet intelligence and actionable threat insights to global governments, over 50% of the Fortune 500, and leading threat intelligence providers worldwide.Role Summary: We’re hiring a technically-adept Product Marketing Manager who can act as a bridge between product, engineering, and customers. Ideal backgrounds include sales engineering, product management, solutions architecture, or technical customer success. You s" },
  { company: "enova", role: "CashNetUSA Collections Representative (Remote)", location: "Chicago, IL", url: "https://job-boards.greenhouse.io/enova/jobs/7985346", jd: "We are interested in every qualified candidate who is eligible to work in the United States. However, we are not able to sponsor visas or take over sponsorship at this time.#BI-Remote #LI-Remote This role is fully remote but requires candidates to live in IL, UT, IN, IA, MO, TX, WI, or WY. About the role: As a Collections Representative, your core responsibility will be to proactively contact customers with overdue accounts, understand their financial challenges, and collaboratively identify solutions to help them maintain consistent loan payments. This position requires comfort and expertise in navigating and resolving difficult customer situations with professionalism and empathy. Responsibilities: Manage hig" },
];
