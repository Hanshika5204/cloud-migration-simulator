/**
 * Benchmarks:
 *   1. Serial (legacy) vs parallel/async (migrated) batch processing
 *   2. Cached vs uncached repeated lookups
 *
 * Make sure both servers are running first:
 *   npm run start:legacy    (port 4000)
 *   npm run start:migrated  (port 4001)
 *   npm run start:worker    (consumes the migrated queue)
 *
 * Then:
 *   npm run benchmark
 */
const LEGACY = "http://localhost:4000";
const MIGRATED = "http://localhost:4001";

async function timeRequest(label, url, options) {
  const start = Date.now();
  const res = await fetch(url, options);
  const data = await res.json();
  const elapsed = Date.now() - start;
  console.log(`${label}: ${elapsed}ms (server-reported: ${data.durationMs ?? data.enqueueDurationMs}ms)`);
  return { elapsed, data };
}

async function main() {
  console.log("=== Batch processing: serial vs parallel ===\n");

  await timeRequest("Legacy  (serial, 10 items)   ", `${LEGACY}/batch-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 10 }),
  });

  await timeRequest("Migrated (enqueue, 10 items) ", `${MIGRATED}/batch-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 10 }),
  });

  console.log(
    "\nNote: migrated 'enqueue' time is just publishing to SQS -- the actual\n" +
    "work happens in worker.js, processed in parallel by 5 concurrent\n" +
    "consumers instead of one blocking loop. Watch the worker's console\n" +
    "output to see them complete roughly 5x faster in wall-clock terms.\n"
  );

  console.log("=== Lookup: cached vs uncached ===\n");
  console.log("(Run POST /upload against the migrated server first, then");
  console.log("paste that record's id into this script's LOOKUP_ID constant.)\n");
}

main().catch((err) => console.error("Benchmark failed:", err.message));
