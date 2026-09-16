# KAM GRAINS ERP

KAM GRAINS ERP is a full-stack business management system designed to manage sales, purchasing, inventory, accounts receivable, accounts payable, finance, reporting, and operational workflows for a grain trading business.

The system is currently used as the operational ERP for KAM GRAINS and is being developed as the foundation for a broader multi-business ERP and POS platform.

## Core Features

### Sales
- Sales Orders
- Deliveries
- AR Invoices
- Customer Receipts / AR Payments
- Credit sales tracking
- Customer balances
- Invoice posting and settlement
- Backdated transaction support

### Purchasing
- Purchase Orders
- Goods Receipts
- Supplier invoices
- AP Payments
- Partial supplier payments
- Supplier balances
- Purchase posting workflows

### Inventory
- Stock on hand
- Lot tracking
- Stock movements
- Product reclassification
- Stock adjustments
- Stock counts
- Cleaning batches
- Inventory costing

### Finance
- Journals
- Expense vouchers
- Payment tracking
- Reconciliations
- Posting controls

### Reporting
- Weekly management summary
- Weekly sales by product
- Weekly purchases by product
- Weekly profit by product
- Customer weekly performance
- Dormant customers
- Customer RFM analysis
- Operational exports to Excel

### Audit and Controls
- Backdated transaction tracking
- Backdate reasons and approvals
- Posted / unposted transaction controls
- Audit logging
- Transaction date based business reporting

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- TanStack React Query
- Tailwind CSS
- shadcn/ui
- Lucide React

### Backend
- Node.js
- Express.js

### Database
- PostgreSQL

Main database schemas include:

- `sal` - Sales
- `pur` - Purchasing
- `inv` - Inventory
- `fin` - Finance
- `app` - Application data
- `sec` - Security
- `audit` - Audit records
- `reporting` - Reporting views and analytics

## Project Structure

```text
KamGrainsWeb/
│
├── backend/
│   └── Node.js / Express API
│
├── database/
│   ├── migrations/
│   └── database scripts
│
├── frontend/
│   └── React / TypeScript / Vite application
│
└── README.md
Local Development
Backend
cd C:\BusinessSystems\KamGrainsWeb\backend
npm.cmd install
npm.cmd run build
npm.cmd start

The backend normally runs on:

http://localhost:3000
Frontend
cd C:\BusinessSystems\KamGrainsWeb\frontend
npm.cmd install
npm.cmd run dev

The development frontend normally runs on:

http://localhost:5173
Production Build
Backend
cd C:\BusinessSystems\KamGrainsWeb\backend
npm.cmd run build
Frontend
cd C:\BusinessSystems\KamGrainsWeb\frontend
npm.cmd run build

The frontend production build is generated in:

frontend/dist/
Windows Services

The deployed system currently runs using Windows services.

Backend service:

KamGrainsAPI

Frontend service:

KamGrainsFrontend

Example commands:

net stop KamGrainsAPI
net start KamGrainsAPI

net stop KamGrainsFrontend
net start KamGrainsFrontend
Business Reporting Rules

Important reporting rules currently used by the system:

Deliveries are treated as the primary sales business event.
Business reporting uses transaction_date.
Weekly reporting runs Monday through Sunday.
Backdated transactions are tracked separately with reason and approval information.
Sales posting creates stock movements and finance journal entries.
Current Development Direction

The long-term goal is to evolve the system into a configurable multi-business ERP and POS platform.

Planned capabilities include:

Quick Sale / POS mode
Barcode scanning
Mobile and desktop responsive access
Progressive Web App support
Offline sales with synchronization
Multi-business / multi-tenant deployment
Subscription-based licensing
Separate customer databases
Configurable modules for different industries
Support for businesses such as:
Grain traders
Supermarkets
Agricultural product dealers
Spare parts shops
General retail businesses

The current KAM GRAINS workflows will remain supported while additional quick-sale and POS workflows are introduced.

Security

Sensitive files should not be committed to the repository.

Examples:

.env
.env.*
database backups
credentials
API secrets
production configuration

These files are excluded through .gitignore.

Repository Status

This repository represents the current active development version of KAM GRAINS ERP.

Major development areas currently include:

Sales
Purchasing
Inventory
AR / AP
Finance
Reporting
Excel exports
Backdated transaction handling
Query cache synchronization
Posting workflows
Author

Developed and maintained by:

Alinaitwe Kenneth Bukenya

License

Private proprietary software.

Unauthorized copying, redistribution, resale, or modification is not permitted without permission.
