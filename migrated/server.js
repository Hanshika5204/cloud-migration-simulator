/**
 * MIGRATED VERSION
 * -----------------------------------------------------------------------
 * Same functionality as legacy/server.js, but migrated in three distinct
 * patterns -- worth calling out explicitly in an interview:
 *
 *   1. LIFT-AND-SHIFT: the Express app itself is unchanged in structure --
 *      it's the same framework/runtime, just pointed at cloud endpoints.
 *
 *   2. RE-PLATFORM: local disk -> S3, flat JSON file -> DynamoDB.
 *      No redesign of app logic, just swapping the storage backend.
 *
 *   3. RE-ARCHITECT: batch processing is no longer a blocking synchronous
 *      loop. It's decomposed into: producer (this file) pushes messages
 *      to SQS -> consumer (worker.js) processes them independently and in
 *      parallel. This is an actual architectural change, not a swap.
 *
 * Also adds a caching layer in front of the DynamoDB lookup, since
 * that data is read far more often than it changes (a good caching
 * candidate: read-heavy, tolerant of a few seconds of staleness).
 * -----------------------------------------------------------------------
 */
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const NodeCache = require("node-cache");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { s3Client, ddbDocClient, sqsClient } = require("./aws-config");

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

const BUCKET = process.env.BUCKET_NAME || "migration-sim-bucket";
const TABLE = process.env.TABLE_NAME || "migration-sim-table";
const QUEUE_URL =
  process.env.QUEUE_URL ||
  "http://localhost:4566/000000000000/migration-sim-queue";

// TTL cache: 30s. Short enough to stay reasonably fresh, long enough to
// absorb repeated reads of the same hot record.
const cache = new NodeCache({ stdTTL: 30 });

// RE-PLATFORM: disk write -> S3 put
app.post("/upload", upload.single("file"), async (req, res) => {
  const id = uuidv4();
  const key = `uploads/${id}-${req.file.originalname}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
    })
  );

  const record = {
    id,
    originalName: req.file.originalname,
    s3Key: key,
    uploadedAt: new Date().toISOString(),
  };

  // RE-PLATFORM: flat JSON file -> DynamoDB item
  await ddbDocClient.send(
    new PutCommand({ TableName: TABLE, Item: record })
  );

  cache.del(id); // invalidate in case of overwrite
  res.json({ message: "Uploaded to S3 + DynamoDB (migrated)", record });
});

// RE-ARCHITECT: no more blocking for-loop. Enqueue N messages and return
// immediately -- the worker(s) in worker.js pick these up independently.
app.post("/batch-process", async (req, res) => {
  const { count = 5 } = req.body;
  const start = Date.now();

  const sends = Array.from({ length: count }, (_, i) =>
    sqsClient.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify({ item: `item-${i}` }),
      })
    )
  );
  await Promise.all(sends);

  res.json({
    mode: "async-parallel (SQS fan-out)",
    count,
    enqueueDurationMs: Date.now() - start,
    note: "Items are processed independently by worker.js -- run `npm run start:worker` to see them consumed in parallel.",
  });
});

// Cache-aside pattern: check cache first, only hit DynamoDB on a miss.
app.get("/lookup/:id", async (req, res) => {
  const start = Date.now();
  const id = req.params.id;

  const cached = cache.get(id);
  if (cached) {
    return res.json({
      cached: true,
      durationMs: Date.now() - start,
      record: cached,
    });
  }

  const result = await ddbDocClient.send(
    new GetCommand({ TableName: TABLE, Key: { id } })
  );

  if (result.Item) cache.set(id, result.Item);

  res.json({
    cached: false,
    durationMs: Date.now() - start,
    record: result.Item || null,
  });
});

app.get("/records", async (req, res) => {
  const result = await ddbDocClient.send(new ScanCommand({ TableName: TABLE }));
  res.json({ records: result.Items || [] });
});

app.get("/health", (req, res) => res.json({ status: "ok", mode: "migrated" }));

const PORT = process.env.MIGRATED_PORT || 4001;
app.listen(PORT, () => {
  console.log(`[migrated] app running on http://localhost:${PORT}`);
  console.log(`[migrated] storage: S3 bucket "${BUCKET}"`);
  console.log(`[migrated] metadata: DynamoDB table "${TABLE}"`);
});
