import {
  App,
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnOutput,
} from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import {SqsEventSource} from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Key, Alias } from "aws-cdk-lib/aws-kms";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  ArnPrincipal,
  AccountRootPrincipal,
} from "aws-cdk-lib/aws-iam";

import { Construct } from "constructs";

export class AwsQueueToDbPocStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountId = Stack.of(this).account;

    //const key = Key.fromKeyArn(this, 'ImportedKey', "arn:aws:kms:eu-west-1:126027396100:key/mrk-b7d1c025435744aea7fca3787c74136f")
    const key = Key.fromLookup(this, 'ImportedKey', {aliasName: 'alias/my-imported-encryption-key',});

    const queue = new sqs.Queue(this, "InputQueue", {
      visibilityTimeout: Duration.minutes(5),
      encryptionMasterKey: key,
      queueName: "PocQueue",
      retentionPeriod: Duration.hours(2),
    });

    const table = new Table(this, "message-table", {
      tableName: "messages",
      partitionKey: {
        name: "messageId",
        type: AttributeType.STRING,
      },
      readCapacity: 5,
      writeCapacity: 5,
      encryptionKey: key,
      /**
       *  The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
       * the new table, and it will remain in your account until manually deleted. By setting the policy to
       * DESTROY, cdk destroy will delete the table (even if it has data in it)
       */
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
    });

    // create Lambda function
    const lambdaFunction = new NodejsFunction(this, "index", {
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: path.join(__dirname, "../src/lambda/index.ts"),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    table.grantWriteData(lambdaFunction);

    queue.grantConsumeMessages(lambdaFunction);

    key.grantEncryptDecrypt(lambdaFunction);

    // add sqs queue as event source for lambda
    lambdaFunction.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 10,
      }),
    );

/*    queue.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AccountRootPrincipal()],
        actions: ["SQS:SendMessage"],
        resources: ["*"],
      })
    );

    queue.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [lambdaFunction.role!],
        actions: ["SQS:ReceiveMessage"],
        resources: ["*"],
      })
    );*/

  }
}
