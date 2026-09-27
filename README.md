# Cloud Migration Simulator

Demonstrates a legacy monolith being migrated to AWS using three distinct
patterns -- **lift-and-shift**, **re-platform**, and **re-architect** --
plus a serial-vs-parallel execution benchmark and a caching layer.
Runs against [LocalStack](https://www.localstack.cloud/) so no real AWS
account or billing is required; the same code works unmodified against
real AWS by removing the `AWS_ENDPOINT` env var.

See `docs/MIGRATION-DECISIONS.md` for the full write-up of *why* each
decision was made -- that's the part worth walking an interviewer through.

## Prerequisites
- Node.js 18+
- Docker Desktop (for LocalStack)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start LocalStack (emulates S3, DynamoDB, SQS locally)
docker compose up -d

# 3. Create the AWS resources (bucket, table, queue) inside LocalStack
node scripts/setup-localstack.js
```

## Running

Open four terminals:

```bash
# Terminal 1 -- legacy (pre-migration) app
npm run start:legacy        # http://localhost:4000

# Terminal 2 -- migrated app
AWS_ENDPOINT=http://localhost:4566 npm run start:migrated   # http://localhost:4001

# Terminal 3 -- worker(s) consuming the SQS queue (stands in for Lambda)
AWS_ENDPOINT=http://localhost:4566 npm run start:worker

# Terminal 4 -- run the benchmark
npm run benchmark

# Terminal 5 -- the dashboard UI
npm run start:frontend      # http://localhost:5000
```

Open **http://localhost:5000** in your browser for a visual dashboard: upload files to either version, trigger serial vs async batch jobs, see the cache hit/miss demo, and browse uploaded records — all without touching the terminal. This is the best thing to have open and click through live in the interview.

## Try it manually

```bash
# Upload a file to the legacy app (saved to local disk)
curl -F "file=@./README.md" http://localhost:4000/upload

# Upload a file to the migrated app (saved to S3 + DynamoDB)
curl -F "file=@./README.md" http://localhost:4001/upload

# Trigger serial batch processing (legacy) -- blocks until all items done
curl -X POST http://localhost:4000/batch-process -H "Content-Type: application/json" -d '{"count":10}'

# Trigger async parallel batch processing (migrated) -- returns immediately,
# watch Terminal 3 to see items processed concurrently by the worker(s)
curl -X POST http://localhost:4001/batch-process -H "Content-Type: application/json" -d '{"count":10}'

# Look up a record twice -- second call should show cached: true
curl http://localhost:4001/lookup/<id-from-upload-response>
curl http://localhost:4001/lookup/<id-from-upload-response>
```

## Project structure

```
legacy/          -- pre-migration app: local disk, flat JSON "db", serial loop
migrated/         -- post-migration app: S3, DynamoDB, SQS producer, cache-aside lookup
migrated/worker.js -- SQS consumer(s), stands in for Lambda's auto-scaled concurrency
scripts/          -- LocalStack resource setup + benchmark script
docs/             -- migration decision write-up (read this before the interview)
docker-compose.yml -- spins up LocalStack
```

## Talking points for the interview
- Explain each migration as lift-and-shift / re-platform / re-architect --
  and *why* that category was the right call for that component.
- Walk through the serial-vs-parallel benchmark numbers.
- Explain the cache-aside pattern and when caching is/isn't appropriate.
- Discuss the downtime-minimization plan in `docs/MIGRATION-DECISIONS.md`
  even though it isn't literally implemented (dual-write, shadow-read,
  cutover, rollback).
- Be upfront that this runs on LocalStack, not real AWS, and explain that
  the code is AWS-SDK-standard so it's a one-line endpoint change to run
  against real AWS -- shows you understand it's the same interface.
