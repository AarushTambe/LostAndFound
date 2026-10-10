
# Campus Lost & Found Portal

A database-driven web application for managing lost and found belongings within a college campus. The portal provides a shared announcement board where students can report lost or found items, while authorized desk staff manage physical custody, verify claims, and record completed returns.

## Project Information

- **Project title:** Campus Lost & Found Portal
- **Project type:** DBMS academic project
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js, TypeScript
- **Database:** PostgreSQL
- **Authentication:** JSON Web Tokens (JWT)
- **Password security:** bcrypt
- **Database connectivity:** node-postgres (`pg`)

## Problem Statement

Lost belongings are often reported through informal channels, making it difficult to maintain a central record, coordinate ownership claims, and confirm that recovered items have actually been returned.

This project provides a centralized system for recording reports, maintaining item and claim statuses, controlling access to staff operations, and tracking the recovery process through database-backed workflows.

## Features

### Student features
- Register and log in securely.
- Browse lost and found announcements.
- Search reports by keywords and filter by type, category, and status.
- Submit lost-item and found-item reports.
- Submit claims for eligible found items.
- Edit permitted details of their own open reports through the API.

### Desk staff features
- Confirm physical receipt of found items.
- View claims associated with found-item reports.
- Approve or reject pending claims.
- Record physical collection and complete the recovery workflow.
- Link a lost report with its corresponding found report through the API.

### Database and security features
- Relational tables with primary and foreign keys.
- Unique constraints and status validation checks.
- Indexed fields for common queries.
- Password hashing and token-based authentication.
- Parameterized SQL queries.
- Role-based authorization for staff-only operations.
- Transactions and row locking for claim decisions and recovery completion.

## Recovery Workflow

1. A student reports a lost or found item.
2. A found report starts with custody status `pending_handover`.
3. Authorized desk staff confirm physical receipt, changing custody status to `in_custody`.
4. An eligible student submits a claim.
5. Staff approve or reject the claim.
6. After approval, staff record the physical return.
7. The claim becomes `completed`, the item becomes `resolved`, and custody becomes `released`.

A lost announcement and a found report remain separate records. Staff can link corresponding reports when a match is identified.

## Database Design

The application uses three core relational tables.

### `users`
Stores registered accounts, password hashes, and roles.

- Primary key: `id`
- Unique field: `email`
- Roles: `user`, `admin`

### `items`
Stores lost and found announcements and custody information.

- Primary key: `id`
- Foreign key: `user_id` references `users(id)`
- Optional self-referencing foreign key: `matched_item_id` references `items(id)`
- Item types: `lost`, `found`
- Item statuses: `open`, `claimed`, `resolved`
- Custody statuses: `not_applicable`, `pending_handover`, `in_custody`, `released`

### `claims`
Stores ownership claims submitted against found-item reports.

- Primary key: `id`
- Foreign key: `item_id` references `items(id)`
- Foreign key: `claimant_id` references `users(id)`
- Unique constraint: `(item_id, claimant_id)`
- Claim statuses: `pending`, `approved`, `rejected`, `completed`

See the ER diagram in [`docs/ER-DIAGRAM.md`](docs/ER-DIAGRAM.md).

## Project Structure

```text
LostAndFound/
├── database/
│   ├── schema.sql
│   └── migrations/
│       ├── 002_custody_workflow.sql
│       └── 003_claim_completion.sql
├── docs/
│   └── ER-DIAGRAM.md
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── index.html
├── src/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── app.ts
│   └── server.ts
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

## Prerequisites

Install the following before running the project:

- Node.js and npm
- PostgreSQL
- Git

## Setup and Execution

### 1. Clone the repository

```bash
git clone https://github.com/AarushTambe/LostAndFound.git
cd LostAndFound
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the PostgreSQL database

Create a database named `lost_found` using PostgreSQL or pgAdmin.

### 4. Initialize the database

Execute the SQL files in this order using the pgAdmin Query Tool or `psql`:

1. `database/schema.sql`
2. `database/migrations/002_custody_workflow.sql`
3. `database/migrations/003_claim_completion.sql`

Run them against the same database. Do not skip the migrations: they add custody tracking and support completed claims.

### 5. Configure environment variables

Create a local `.env` file in the project root:

```dotenv
DATABASE_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/lost_found
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret
```

Replace the database username and password with your local PostgreSQL credentials. Use a strong, private JWT secret.

### 6. Build and run

Compile TypeScript:

```bash
npm run build
```

Start the development server:

```bash
npm run dev
```

Open the application at:

http://localhost:3000

The production-mode server can be started after a successful build with:

```bash
npm start
```

## API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Authenticate a user |
| GET | `/api/auth/me` | Retrieve the authenticated profile |
| GET | `/api/items` | Browse and filter announcements |
| GET | `/api/items/:id` | Retrieve an item report |
| POST | `/api/items` | Create a report |
| PATCH | `/api/items/:id` | Edit an eligible report |
| PATCH | `/api/items/:id/receive` | Confirm physical receipt; staff only |
| PATCH | `/api/items/:id/match` | Link corresponding reports; staff only |
| POST | `/api/items/:id/claims` | Submit an ownership claim |
| GET | `/api/items/:id/claims` | Review claims; staff only |
| PATCH | `/api/claims/:id` | Approve or reject a claim; staff only |
| PATCH | `/api/claims/:id/complete` | Record a completed return; staff only |

Protected endpoints require a valid bearer token. Staff-only endpoints require an authorized staff account.

## Testing

The project includes an end-to-end workflow script, `test-workflow.js`, that exercises account authentication, found-item reporting, staff receipt confirmation, claim submission, claim approval, and recovery completion.

Run it with the server running and the test database configured:

```bash
node test-workflow.js
```

The complete recovery workflow has been manually verified through the browser and API. Additional edge-case and automated regression tests are part of the final validation process.

## Repository

GitHub: https://github.com/AarushTambe/LostAndFound

## Academic Use

Developed as a college DBMS project to demonstrate relational database design, constraints, SQL operations, authentication, role-based access control, and transaction-backed workflows.
