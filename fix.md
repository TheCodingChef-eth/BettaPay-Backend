#41 Add settlement listing with pagination
Repo Avatar
Betta-Pay/BettaPay-Backend
Description: The GET /api/settlements endpoint returns all settlements with no pagination. As the dataset grows, this will become slow and return massive responses.

Requirements:

Accept limit and offset query parameters via Zod validation
Default to limit=50, max limit=200
Return pagination metadata: { total, limit, offset, hasMore }
Order by createdAt descending
Suggested execution steps:

Create a PaginationQuery schema in @bettapay/validation
Parse query params with the schema
Query with prisma.settlement.findMany({ take: limit, skip: offset, orderBy: { initiatedAt: 'desc' } })
Count total matching records
Return paginated response with metadata