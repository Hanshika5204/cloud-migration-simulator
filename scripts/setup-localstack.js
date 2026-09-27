/**
 * One-time setup: creates the S3 bucket, DynamoDB table, and SQS queue
 * inside LocalStack. Run this once after `docker compose up -d`.
 *
 *   node scripts/setup-localstack.js
 */
process.env.AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";

const { CreateBucketCommand } = require("@aws-sdk/client-s3");
const { CreateTableCommand } = require("@aws-sdk/client-dynamodb");
const { CreateQueueCommand } = require("@aws-sdk/client-sqs");
const { s3Client, ddbDocClient, sqsClient } = require("../migrated/aws-config");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

const ddbRawClient = new DynamoDBClient({
  region: "us-east-1",
  endpoint: process.env.AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

async function main() {
  console.log("Creating S3 bucket...");
  try {
    await s3Client.send(
      new CreateBucketCommand({ Bucket: "migration-sim-bucket" })
    );
    console.log("  ✓ bucket created");
  } catch (e) {
    console.log(`  (skipped: ${e.name})`);
  }

  console.log("Creating DynamoDB table...");
  try {
    await ddbRawClient.send(
      new CreateTableCommand({
        TableName: "migration-sim-table",
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
    console.log("  ✓ table created");
  } catch (e) {
    console.log(`  (skipped: ${e.name})`);
  }

  console.log("Creating SQS queue...");
  try {
    const res = await sqsClient.send(
      new CreateQueueCommand({ QueueName: "migration-sim-queue" })
    );
    console.log(`  ✓ queue created: ${res.QueueUrl}`);
  } catch (e) {
    console.log(`  (skipped: ${e.name})`);
  }

  console.log("\nDone. LocalStack resources are ready.");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
