// asset-input/environment/aws-queue-to-db-with-encryption-and-byok/src/lambda/index.ts
var import_aws_sdk = require("aws-sdk");
var TABLE_NAME = process.env.TABLE_NAME || "";
var dynamodb = new import_aws_sdk.DynamoDB.DocumentClient();
exports.handler = async (event) => {
  try {
    console.log("event:", JSON.stringify(event, void 0, 2));
    for (const record of event.Records) {
      const messageBody = record.body;
      const params = {
        TableName: TABLE_NAME,
        Item: {
          messageId: record.messageId,
          content: messageBody
        }
      };
      console.log("params:", JSON.stringify(params, void 0, 2));
      await dynamodb.put(params).promise();
    }
    return {
      statusCode: 200,
      body: "Messages inserted into DynamoDB successfully."
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: "Error inserting messages into DynamoDB."
    };
  }
};
