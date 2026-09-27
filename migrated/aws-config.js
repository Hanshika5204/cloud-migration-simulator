/**
 * Central AWS client config.
 *
 * Points at LocalStack by default (AWS_ENDPOINT env var), so the exact
 * same code runs against real AWS in production by just removing that
 * one env var / endpoint override. That's the whole point of using the
 * SDK properly instead of hand-rolling HTTP calls.
 */
const { S3Client } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");

const isLocal = !!process.env.AWS_ENDPOINT;

const baseConfig = isLocal
  ? {
      region: "us-east-1",
      endpoint: process.env.AWS_ENDPOINT || "http://localhost:4566",
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
      forcePathStyle: true, // required for LocalStack S3
    }
  : {
      region: process.env.AWS_REGION || "us-east-1",
      // real credentials come from the environment / IAM role, never hardcoded
    };

const s3Client = new S3Client(baseConfig);
const ddbClient = new DynamoDBClient(baseConfig);
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const sqsClient = new SQSClient(baseConfig);

module.exports = { s3Client, ddbDocClient, sqsClient, isLocal };
