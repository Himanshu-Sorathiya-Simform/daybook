POC APPLICATION 4
Personal Finance and Investment Dashboard
3-Line Portal Summary
A modern financial dashboard that helps users manage expenses, budgets, subscriptions, savings goals, and investment portfolios.

The platform focuses on data visualization and frontend architecture rather than financial calculations.

The application uses mocked APIs through JSON Server, allowing trainees to focus on UI, state management, charts, and external integrations.

Project Objective
Build a data-intensive dashboard that teaches:

Dashboard development
Data visualization
Complex state management
Filtering
Reporting
Frontend performance optimization
Suggested Technology Stack
Layer	Technology
Frontend	Next.js
Language	TypeScript
State Management	Zustand
Mock Backend	JSON Server
Charts	Apache ECharts
CMS	Headless CMS
Error Monitoring	Sentry
Code Quality	SonarQube
PWA	Service Workers
Payment	Stripe
Testing	Playwright
User Roles
User
Manage finances
Premium User
Access advanced reports
Functional Requirements
Dashboard
FR-1
Display financial metrics.

Widgets:

Monthly spending
Savings
Budget utilization
Subscription costs
Investment growth
Expense Tracking
FR-2
Users can:

Add expenses
Edit expenses
Delete expenses
Categories:

Food
Shopping
Transportation
Utilities
Entertainment
Budget Management
FR-3
Users can:

Create budgets
Modify budgets
Track spending limits
Subscription Tracker
FR-4
Track recurring subscriptions.

Display:

Upcoming renewals
Monthly costs
Annual costs
Goal Management
FR-5
Users can create savings goals.

Examples:

Vacation
Car purchase
Emergency fund
Investment Portfolio
FR-6
Support multiple asset types.

Mock assets:

Stocks
ETFs
Cryptocurrency
Mutual funds
Dynamic Charts
FR-7
Implement:

Line charts
Bar charts
Donut charts
Heat maps
Comparative charts
Users should be able to:

Filter
Zoom
Export
CMS Integration
FR-8
Use a headless CMS to manage:

Financial education articles
Market news
Investment guides
AI Insights Panel
FR-9
Display AI-generated financial insights.

Examples:

Spending trends
Savings recommendations
Budget alerts
Responses can be mocked.

Report Builder
FR-10
Users can generate reports.

Supported reports:

Monthly
Quarterly
Annual
Export formats:

PDF
CSV
Premium Subscription
FR-11
Integrate Stripe.

Premium features:

Advanced analytics
Additional reports
Unlimited goals
Search and Filtering
FR-12
Implement:

Global search
Category filters
Date filters
Tag filters
Theme Engine
FR-13
Support:

Light mode
Dark mode
Custom dashboard layouts
Persist preferences using local storage.

Progressive Web Application
FR-14
Support:

Offline mode
Local caching
Installable applications
Monitoring
FR-15
Integrate:

Sentry
SonarQube
Performance Optimization
FR-16
Implement:

Lazy loading
Virtualization
Memoization
Code splitting
Testing
FR-17
Implement:

Unit tests
E2E tests
Integration tests
Stretch Goals
Drag-and-drop dashboard widgets
Session replay
Feature flags
Dashboard customization
Widget marketplace
Advanced Frontend Concepts Covered
Complex dashboards
Dynamic charts
Zustand
CMS
Stripe
PWA
Performance optimization
Search
Data visualization
Success Criteria
The application should behave like a production-grade financial dashboard while relying almost entirely on mocked data from JSON Server.
