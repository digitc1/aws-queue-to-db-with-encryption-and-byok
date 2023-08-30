import { Handler } from 'aws-lambda';

import { DynamoDB, SQSEvent } from 'aws-sdk';

const TABLE_NAME = process.env.TABLE_NAME || '';

// Create an instance of the DynamoDB DocumentClient
const dynamodb = new DynamoDB.DocumentClient();

exports.handler = async (event: SQSEvent) => {
    try {
        console.log("event:", JSON.stringify(event, undefined, 2));
        // Loop through the records in the SQS event
        for (const record of event.Records) {
            const messageBody = record.body;
            
            // Prepare the item to be inserted into DynamoDB
            const params = {
                TableName: TABLE_NAME,
                Item: {
                    messageId: record.messageId,
                    content: messageBody
                }
            };

            console.log("params:", JSON.stringify(params, undefined, 2));
            
            // Put the item into DynamoDB
            await dynamodb.put(params).promise();
        }
        
        return {
            statusCode: 200,
            body: 'Messages inserted into DynamoDB successfully.'
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: 'Error inserting messages into DynamoDB.'
        };
    }
};
