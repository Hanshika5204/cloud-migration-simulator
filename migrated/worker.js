/**
 * WORKER (stands in for a Lambda function triggered by SQS)
 * -----------------------------------------------------------------------
 * In real AWS this logic would be a Lambda function with an SQS event
 * source mapping, and AWS itself handles the parallel invocation scaling.
 * Locally, we simulate that by running several concurrent "workers" that
 * each long-poll the queue and process messages independently -- which
 * is functionally the same fan-out behaviour.
 *
 * Run alongside migrated/server.js:  npm run start:worker
 * -----------------------------------------------------------------------
 */
const { ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { sqsClient } = require("./aws-config");

const QUEUE_URL =
  process.env.QUEUE_URL ||
  "http://localhost:4566/000000000000/migration-sim-queue";

const CONCURRENT_WORKERS = 5; // simulates Lambda's automatic parallel scaling

async function processMessage(message) {
  const body = JSON.parse(message.Body);
  const start = Date.now();

  // simulate per-item work -- same cost as the legacy serial version,
  // but now many of these run at the same time instead of queued up
  await new Promise((r) => setTimeout(r, 200));

  console.log(
    `[worker] processed ${body.item} in ${Date.now() - start}ms`
  );

  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle,
    })
  );
}

async function pollLoop(workerId) {
  while (true) {
    const result = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 5, // long polling
      })
    );

    if (result.Messages && result.Messages.length > 0) {
      await processMessage(result.Messages[0]);
    }
  }
}

console.log(`[worker] starting ${CONCURRENT_WORKERS} concurrent pollers...`);
for (let i = 0; i < CONCURRENT_WORKERS; i++) {
  pollLoop(i).catch((err) => console.error(`[worker-${i}] error:`, err.message));
}
