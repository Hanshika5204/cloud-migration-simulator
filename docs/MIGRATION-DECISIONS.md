# Migration Decisions

A short spec + decision log for this project. Written the way I'd document
a real migration for a team, including where the "spec" was ambiguous and
how I resolved it.

## Starting point (legacy/)
A single Express process. Files saved to local disk. Metadata in a flat
JSON file read/written on every request. Batch jobs processed strictly
one-after-another in a for-loop. No caching anywhere.

## Migration strategy, service by service

| Component        | Strategy          | Why                                                                 |
|-------------------|--------------------|----------------------------------------------------------------------|
| Compute (Express) | Lift-and-shift     | The app logic itself doesn't need to change to benefit from the cloud -- same framework, just pointed at cloud endpoints. No reason to rewrite what isn't broken. |
| File storage      | Re-platform        | Local disk → S3. Same "put a file, get a file" mental model, but now durable, shared across instances, and not tied to one machine's disk. |
| Metadata storage  | Re-platform        | Flat JSON file → DynamoDB. Same key-value access pattern, but now handles concurrent writes correctly (the JSON file would corrupt under concurrent access) and scales past what fits in memory. |
| Batch processing  | Re-architect       | This is the one case where re-platforming wasn't enough. A blocking for-loop can't become "cloud-native" just by moving servers -- it had to be redesigned as producer (SQS) + independent consumers (Lambda-style workers), which is a genuine architectural change, not a swap. |

## Serial vs parallel
The legacy batch endpoint processes N items strictly one after another --
total time scales linearly with N. The migrated version publishes all N
items to an SQS queue and returns immediately; multiple workers (standing
in for auto-scaled Lambda invocations) consume the queue concurrently, so
wall-clock time is closer to (N / worker_count) instead of N.

## Caching
Added a cache-aside layer (30s TTL) in front of the DynamoDB lookup.
Reasoning for *when* this applies: the data is read far more often than
it's written, and a few seconds of staleness is acceptable for this use
case. I would NOT cache the upload endpoint (writes must be immediately
consistent) or anything where stale reads could cause a correctness bug
(e.g. an inventory count feeding into a purchase decision).

## Minimizing downtime during cutover
This project doesn't implement a live cutover (no real traffic to switch),
but the plan I'd use:
1. Dual-write phase: write to both old and new storage simultaneously,
   read from old, to validate the new path without user-facing risk.
2. Backfill existing data from old storage into new (S3/DynamoDB) via a
   one-off migration script.
3. Shadow-read phase: read from both, compare results, log mismatches,
   still serve from old.
4. Cutover: switch reads to new storage. Keep dual-write running briefly
   as a rollback safety net.
5. Decommission the old path once confidence is high.

## Ambiguities I resolved myself (since there's no real spec-giver here)
- "Which storage/db to use" -- picked S3 + DynamoDB since they're the most
  commonly asked-about AWS services and directly named in the JD.
- "How many workers simulate Lambda's parallelism" -- picked 5 as an
  arbitrary but clearly-stated constant (`CONCURRENT_WORKERS` in worker.js),
  since real Lambda concurrency is managed by AWS, not hardcoded.
- "Cache TTL" -- picked 30s as a reasonable default for demo purposes;
  in production this would be driven by how often the underlying data
  actually changes.
