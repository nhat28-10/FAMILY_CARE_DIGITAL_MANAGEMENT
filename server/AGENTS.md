# AGENTS.md — Family Care Backend Instructions

## Scope

This file applies only to the `server/` backend of Family Care – Digital Family Management Solution.

Work only inside this backend unless the user explicitly asks to modify another directory.

Do not modify:

- `admin/`
- `mobile/`
- `k8s/`
- root documentation
- deployment files outside `server/`

unless explicitly requested.

## Project context

Family Care is a role-based digital family management system.

The backend MVP focuses on:

- Authentication and authorization.
- User account management.
- Family workspace management.
- Family member management.
- Role and permission control.
- Family invitation flow.
- Basic subscription management.
- Finance ledger and family budgeting.
- Task assignment, task proof, approval and reward settlement.
- Basic notification.
- Basic chat APIs or WebSocket support when requested.
- SOS alert APIs with basic location support when requested.
- Basic admin APIs when requested.

Do not implement production-grade commercial SaaS infrastructure unless explicitly requested.

## Technology stack

Use the existing backend stack:

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- bcrypt for password and refresh-token hashing
- Swagger/OpenAPI
- Docker Compose for local/demo environment

Do not introduce TypeORM.

Do not add new major frameworks unless the user approves first.

## Existing code first

Before coding, inspect the existing backend structure and follow current patterns.

Check existing modules before adding new code:

- `src/modules/auth`
- `src/modules/users`
- `src/modules/families`
- `src/modules/family-members`
- `src/modules/invitations`

Follow the existing style for:

- module structure
- controllers
- services
- DTOs
- guards
- decorators
- Prisma access
- Swagger decorators
- error handling

Avoid broad refactoring unless the user explicitly requests it.

## API rules

All APIs should follow the existing `/api/v1` prefix.

Keep controllers thin:

- receive request
- validate DTO
- call service
- return raw result

Do not manually wrap successful responses if the global response interceptor already handles it.

Successful responses should follow the existing global response envelope:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Use standard NestJS exceptions for errors:

- `BadRequestException`
- `UnauthorizedException`
- `ForbiddenException`
- `NotFoundException`
- `ConflictException`

Do not return raw error objects.

## DTO and validation rules

Every request body must use a DTO.

Use `class-validator` decorators such as:

- `@IsString()`
- `@IsEmail()`
- `@IsEnum()`
- `@IsOptional()`
- `@IsUUID()`
- `@MinLength()`
- `@IsNumber()`
- `@IsBoolean()`
- `@IsDateString()`

Add Swagger decorators for new DTOs and controllers.

Never accept unchecked raw input directly in services.

## Database and Prisma rules

Use Prisma for all database access.

When changing the database:

1. Update `prisma/schema.prisma`.
2. Create a migration.
3. Run Prisma generate.
4. Update affected DTOs, services, controllers and tests if needed.

Use transactions when multiple database writes must succeed or fail together.

Use pagination for list APIs when the data can grow.

Do not create tables outside the MVP scope unless the user approves.

## Core domain model rules

Keep these concepts separate:

- `UserAccount`: login identity.
- `FamilyWorkspace`: family group or workspace.
- `FamilyMember`: a user's participation inside one family.
- `SystemRole`: system-level role such as admin or normal user.
- `FamilyRole`: role inside a family workspace such as manager, parent or member.
- `Relationship`: display relationship such as father, mother, child, grandparent or other.
- `DeputyPermission`: delegated permission inside a family, not a new system role.

A user can join a family through `FamilyMember`.

A family workspace should have only one primary family manager unless the user explicitly changes this rule.

Deputy or co-manager behavior should be modeled as delegated permission, not as a second primary owner.

## Permission rules

For family-scoped APIs:

- Always check that the current user belongs to the target family.
- Do not allow one family to access another family's data.
- Manager-only actions must require manager/deputy permission.
- Member actions should only allow access to the member's own data unless family permission allows more.

Manager-only actions include:

- invite family member
- remove family member
- assign role
- update family settings
- approve task completion
- approve money request
- configure SOS settings
- view family-level finance report
- manage family budget and finance model

Member actions include:

- view own profile
- view assigned tasks
- submit task proof
- request money
- view own personal finance records
- trigger SOS alert
- send basic announcement or support request when supported

## Finance module rules

Family Care does not hold real money.

The finance module is an internal financial management and ledger system.

It records:

- income
- expense
- contribution
- allowance
- reward
- money request
- adjustment
- budget plan
- financial goal or fund

Finance should support:

- shared family finance
- personal member finance
- finance models such as 5 Jars, 80/20 or Custom
- expense categories
- essential and non-essential classification
- planned vs actual budget comparison
- overspending or shortage alerts
- financial goals or funds

Do not implement:

- real banking
- real withdrawal
- real cash-out
- stored-value wallet
- child wallet with real money custody
- card payment
- real money transfer between family members

Use ledger-style records for traceability.

Prefer clear names such as:

- `FinanceLedger`
- `LedgerEntry`
- `FinanceModel`
- `FinanceJar`
- `FinanceCategory`
- `BudgetPlan`
- `FinancialGoal`
- `MoneyRequest`

Do not treat family finance as a real e-wallet.

## Payment rules

Payment integration is allowed only for demo or sandbox purposes when explicitly requested.

Allowed:

- Pure mock payment flow.
- VNPay Sandbox/Demo.
- MoMo Sandbox/Demo.
- PayOS Sandbox/Demo.
- Subscription payment demo.
- Payment status flow such as `PENDING`, `SUCCESS`, `FAILED`, `CANCELLED`.
- Demo callback or webhook verification if required by the sandbox flow.

Not allowed unless explicitly approved:

- Production/live payment gateway.
- Real money processing.
- Real banking integration.
- Real withdrawal.
- Real cash-out.
- Real card payment.
- Using payment gateway for family fund, allowance, reward or child personal wallet.

If payment is requested, prefer subscription payment demo first.

For family finance, use internal ledger records only.

## Task and reward rules

Task flow should support:

- parent/manager creates task
- task is assigned to family member
- member submits completion
- member may attach proof
- parent/manager approves or rejects
- reward is credited only after approval

Reward can be:

- internal point
- internal ledger reward entry
- non-cash reward description

Do not automatically credit reward before approval unless the user explicitly asks.

## SOS rules

SOS is a safety alert feature, not a medical-grade emergency system.

For MVP, support:

- trigger SOS from app/API
- store SOS alert
- optional current location snapshot
- notify family members
- allow family members or manager to mark safe/resolved
- store basic SOS history

Do not implement:

- medical-grade fall detection
- certified wearable integration
- emergency service dispatch
- continuous location surveillance
- advanced geofencing

unless explicitly requested as prototype/demo.

## Subscription rules

Subscription is basic for MVP.

Allowed:

- subscription plan CRUD for admin
- family subscription status
- start date and expiry date
- manual renewal
- sandbox/demo payment for subscription when requested
- feature limit checks if simple

Do not implement production-grade billing, invoice reconciliation, tax handling or accounting unless explicitly requested.

## Admin rules

Admin APIs are for system management only.

Admin may manage:

- subscription plans
- family accounts
- account lock/unlock
- basic subscription renewal
- basic revenue statistics
- basic reports
- demo system monitoring status

Do not implement full production infrastructure monitoring, Kubernetes autoscaling, automatic per-family container provisioning or cloud billing unless explicitly requested.

## Security rules

Never expose:

- password hash
- refresh token hash
- invitation token hash
- password reset token hash
- JWT secret
- database credentials
- `.env` values
- API keys
- payment secret keys

Hash sensitive tokens before storing them.

Do not hardcode secrets.

Read configuration from environment variables through the existing config pattern.

Validate all inputs.

Check authorization before returning family-scoped data.

## Coding style

Use readable TypeScript.

Keep business logic in services, not controllers.

Prefer small, reviewable changes.

Avoid duplicate logic.

Prefer explicit names over unclear abbreviations.

Use consistent naming:

- `create-x.dto.ts`
- `update-x.dto.ts`
- `x.controller.ts`
- `x.service.ts`
- `x.module.ts`

Do not add unnecessary abstractions.

Do not create generic repositories unless the existing project already uses that pattern.

## Testing and verification

Before finishing a backend task, run relevant commands when possible:

```bash
npm run build
npm run lint:check
npm run test
npx prisma generate
```

When changing Prisma schema, run:

```bash
npx prisma migrate dev --name <migration_name>
```

Do not run destructive database commands unless the user explicitly approves.

Do not run:

```bash
docker compose down -v
```

unless the user confirms deleting the local database volume.

## Docker rules

Docker is for local/demo deployment unless the user explicitly requests production deployment.

Allowed:

- Docker Compose local backend
- PostgreSQL local container
- backend container build
- demo environment setup

Do not implement production Kubernetes, Docker Swarm, autoscaling, dynamic subdomain routing or per-family container provisioning unless explicitly requested.

## Working style for Codex

For every task:

1. Inspect existing files first.
2. Briefly explain the plan.
3. Modify only necessary files.
4. Keep changes small and reviewable.
5. Update Prisma schema and migration together when database changes are needed.
6. Update DTO, service, controller and Swagger together when adding an API.
7. Mention changed files at the end.
8. Mention commands run and whether they passed or failed.

When the requirement is unclear, ask before changing:

- database schema
- authentication logic
- authorization logic
- finance model
- payment flow
- deployment architecture
