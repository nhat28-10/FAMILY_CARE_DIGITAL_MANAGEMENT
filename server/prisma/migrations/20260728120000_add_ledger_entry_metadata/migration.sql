-- Add structured metadata for immutable audit snapshots such as fund allocation history.
ALTER TABLE "ledger_entries" ADD COLUMN "metadata" JSONB;
