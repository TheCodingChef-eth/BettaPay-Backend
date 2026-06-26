#42 Add settlement filtering by status and date range
Repo Avatar
Betta-Pay/BettaPay-Backend
Description: The settlement listing endpoint has no filtering capability. Operators must fetch all settlements and filter client-side.

Requirements:

Accept optional status query parameter (pending, processing, completed, failed)
Accept optional from and to date range parameters (ISO 8601)
Apply filters server-side in the Prisma query
Validate all query parameters with Zod
Suggested execution steps:

Extend the settlement list query schema with optional status, from, to
Build a Prisma where clause dynamically based on provided filters
Parse date strings and validate them
Apply initiatedAt: { gte: from, lte: to } for date range filtering
Example commit message:

feat(settlement-engine): add status and date range filters to settlement list

GET /api/settlements now supports ?status=&from=&to= query params,
applying filters server-side for efficient data retrieval.