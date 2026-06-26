Add BullMQ job retry configuration
Repo Avatar
Betta-Pay/BettaPay-Backend
Description: The BullMQ worker is created without explicit retry configuration. Failed jobs are lost or retried with default settings that may not be appropriate for financial operations.

Requirements:

Configure worker with attempts: 3
Use exponential backoff: { type: 'exponential', delay: 2000 }
Set a maximum backoff of 30 seconds
Log each retry attempt with attempt number
Move jobs to a dead-letter queue after all retries are exhausted
Suggested execution steps:

Add attempts: 3 and backoff: { type: 'exponential', delay: 2000 } to worker options
In the worker handler, inspect job.attemptsMade for logging
Create a dead-letter queue for permanently failed jobs
On final failure, move job data to the DLQ