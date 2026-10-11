# Campus Lost & Found Portal

**Live application:** <https://lostandfound-7iwi.onrender.com/>

A database-backed web application for reporting lost and found belongings on a college campus. Students can publish reports and submit claims, while authorized desk staff manage physical custody, review claims, match reports, and record completed handovers.

## Live Demo and Deployment

- **Application:** <https://lostandfound-7iwi.onrender.com/>
- **Source code:** <https://github.com/AarushTambe/LostAndFound>
- **Application hosting:** Render
- **Database hosting:** Neon PostgreSQL

The deployed application uses a separate production database. Local accounts and data are not automatically copied to production.

## Project Overview

Lost belongings are often reported through informal channels, making it difficult to maintain a central record, coordinate ownership claims, and verify that items have actually been returned. This portal centralizes reports and tracks an item through a defined recovery workflow.

### Features

**Student features**
- Register and log in.
- Browse lost and found announcements.
- Search reports and filter by type, category, and status.
- Submit lost-item and found-item reports.
- Submit claims for eligible found items.
- Edit permitted details of their own open reports.

**Authorized staff features**
- Confirm physical receipt of found items.
- View claims associated with found-item reports.
- Approve or reject pending claims.
- Link a lost report with its corresponding found report.
- Record physical collection and complete the recovery workflow.

**Database and security features**
- Relational tables, primary keys, foreign keys, and constraints.
- Indexed fields for common queries.
- Password hashing with bcrypt.
- JWT-based authentication and role-based authorization.
- Parameterized SQL queries.
- Transactions and row locking for critical claim operations.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL (Neon in production) |
| Database driver | `pg` (node-postgres) |
| Authentication | JSON Web Tokens (`jsonwebtoken`) |
| Password hashing | `bcrypt` |
| Application hosting | Render |
| Source control | Git and GitHub |

## Architecture

```text
Browser
  |
  v
Render: Express + TypeScript application
  |
  v
Neon: PostgreSQL database
```

The application is served by Express, including the static frontend files in `public/`. The application reads its database connection from `DATABASE_URL` and its authentication secret from `JWT_SECRET`.

## Recovery Workflow

1. A student reports a found item.
2. The item awaits physical receipt by authorized staff (`pending_handover`).
3. Staff confirm receipt; custody changes to `in_custody`.
4. An eligible student submits a claim.
5. Staff review the claim and approve or reject it.
6. For an approved claim, staff confirm the physical handover.
7. The claim becomes `completed`, the item becomes `resolved`, and custody becomes `released`.

A lost report and a found report remain separate records. Staff can link the two records when they identify a match.

## Database Design

The core schema contains three relational tables.

### `users`
Stores account details, password hashes, and authorization roles.

- Primary key: `id`
- Unique field: `email`
- Roles: `user`, `admin` (`admin` is used for authorized staff operations)

### `items`
Stores lost and found reports and custody information.

- Primary key: `id`
- Foreign key: `user_id` references `users(id)`
- Optional self-referencing foreign key: `matched_item_id` references `items(id)`
- Types: `lost`, `found`
- Item statuses: `open`, `claimed`, `resolved`
- Custody statuses: `not_applicable`, `pending_handover`, `in_custody`, `released`

### `claims`
Stores claims submitted against found-item reports.

- Primary key: `id`
- Foreign keys: `item_id` references `items(id)` and `claimant_id` references `users(id)`
- Unique constraint: `(item_id, claimant_id)`
- Statuses: `pending`, `approved`, `rejected`, `completed`

See [`DIAGRAM.md`](DIAGRAM.md) for the entity-relationship diagram.

## Repository Structure

```text
LostAndFound/
├── database/
│   ├── schema.sql
│   └── migrations/
│       ├── 002_custody_workflow.sql
│       └── 003_claim_completion.sql
├── public/
│   ├── css/style.css
│   ├── js/app.js
│   └── index.html
├── src/
│   ├── config/db.ts
│   ├── middleware/auth.ts
│   ├── routes/auth.ts
│   ├── routes/claims.ts
│   ├── routes/items.ts
│   ├── app.ts
│   └── server.ts
├── DIAGRAM.md
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── test-edge-cases.js
├── test-workflow.js
├── tsconfig.json
└── README.md
```

## Local Setup and Execution

### Prerequisites

- Node.js and npm
- PostgreSQL for a local development database
- Git

### 1. Clone the repository

```bash
git clone https://github.com/AarushTambe/LostAndFound.git
cd LostAndFound
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Create a local PostgreSQL database

Create a database named `lost_found` using PostgreSQL or pgAdmin.

### 4. Initialize the schema

Apply the SQL files in this order, against the same database:

1. `database/schema.sql`
2. `database/migrations/002_custody_workflow.sql`
3. `database/migrations/003_claim_completion.sql`

For example, from a shell with `psql` installed (replace `YOUR_DB_USER` with your local PostgreSQL username):

```bash
psql -U YOUR_DB_USER -d lost_found -f database/schema.sql
psql -U YOUR_DB_USER -d lost_found -f database/migrations/002_custody_workflow.sql
psql -U YOUR_DB_USER -d lost_found -f database/migrations/003_claim_completion.sql
```

Run the migrations once, in order, on a database initialized from the original schema.

### 5. Configure environment variables

Create a `.env` file in the repository root using `.env.example` as a template. For local PostgreSQL, the configuration will look like:

```dotenv
DATABASE_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/lost_found
PORT=3000
JWT_SECRET=replace_with_a_long_random_secret
```

Use your local database credentials and a strong, private JWT secret. Never commit `.env` or production credentials to GitHub.

### 6. Build and start the application

Build the TypeScript backend:

```bash
npm run build
```

Start the development server:

```bash
npm run dev
```

Open <http://localhost:3000/> in your browser (or use the port configured in `PORT`). To start the compiled application after building, run:

```bash
npm start
```

## API Overview

All endpoints below are prefixed with `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register an account |
| POST | `/api/auth/login` | Log in |
| GET | `/api/auth/me` | Retrieve the authenticated user's profile |
| GET | `/api/health` | Check service/database health |
| GET | `/api/items` | Browse, search, and filter reports |
| GET | `/api/items/:id` | Retrieve an item report |
| POST | `/api/items` | Create a report |
| PATCH | `/api/items/:id` | Edit an eligible report |
| PATCH | `/api/items/:id/receive` | Confirm physical receipt; staff only |
| PATCH | `/api/items/:id/match` | Link corresponding reports; staff only |
| POST | `/api/items/:id/claims` | Submit a claim |
| GET | `/api/items/:id/claims` | View claims; staff only |
| PATCH | `/api/claims/:id` | Approve or reject a claim; staff only |
| PATCH | `/api/claims/:id/complete` | Record completed handover; staff only |

Protected endpoints require a valid bearer token in the `Authorization` header. Staff-only endpoints require an authorized account with the `admin` role.

## Testing

The repository includes scripts for edge-case testing and the main recovery workflow. Run them against a **development/test database**, not production, because they create and modify users, reports, and claims.

Start the local server first. If your server is running on port `3002`, the test scripts can use that port. The edge-case test supports overriding its base URL with `TEST_BASE_URL`.

```bash
node test-edge-cases.js
node test-workflow.js
```

The edge-case suite checks staff-only authorization, custody prerequisites, duplicate claims, competing claims, invalid decisions, and repeated workflow actions. The workflow script checks the main path from authentication and report creation through claim approval and completed handover.

## Production Deployment

The production deployment uses Render for the Node.js web service and Neon for PostgreSQL.

### Render configuration

- **Repository:** `AarushTambe/LostAndFound`
- **Branch:** `main`
- **Build command:** `npm ci --include=dev && npm run build`
- **Start command:** `npm start`
- **Environment variables:** `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV=production`; Render supplies `PORT` at runtime.

### Neon configuration

Set `DATABASE_URL` in Render to the connection string for the correct Neon database and branch. Keep the connection string private. Initialize the production database by applying `database/schema.sql` and then migrations `002_custody_workflow.sql` and `003_claim_completion.sql`, if they have not already been applied.

### Deployment safety

- Production secrets belong in Render's environment settings, not in source control.
- Local `.env` and `localhost` connection strings are for local development only.
- Create or provision staff accounts securely; public registration must not grant staff privileges.
- Do not run automated tests that create or modify records against the production database.
- Verify `/api/health`, login, report creation, staff receipt, claim review, and completed handover after deployment.

## Repository

GitHub: <https://github.com/AarushTambe/LostAndFound>

## Academic Purpose

This project demonstrates relational database design, SQL schema management, authentication, role-based authorization, data validation, and transaction-backed workflows in a campus lost-and-found scenario.
