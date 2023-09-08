# Proof of Concept on SNC Data in AWS using KMS, OpenSSL

The purpose of this exercise is to develop a quick implementation of a lambda reading data from an encrypted queue (SQS) and write the content of the message in a table of an encrypted database (DynamoDB) with a Imported Customer Managed Key (in KMS)

## Before you begin

With encryption at rest, DynamoDB transparently encrypts all customer data in a DynamoDB table, including its primary key and local and global secondary indexes, whenever the table is persisted to disk. (If your table has a sort key, some part of the sort keys are stored in plaintext in the table metadata.) When you access your table, DynamoDB decrypts the table data transparently. You do not need to change the code of your applications to use or manage encrypted tables.

Encryption at rest also protects DynamoDB streams, global tables, and backups whenever these objects are saved to durable media.

Concerning the encryption on SQS, SSE encrypts messages as soon as Amazon SQS receives them. The messages are stored in encrypted form and Amazon SQS decrypts messages only when they are sent to an authorized consumer.

**SSE encrypts the body of a message in an Amazon SQS queue.**

SSE doesn't encrypt the following:
* Queue metadata (queue name and attributes)
* Message metadata (message ID, timestamp, and attributes)
* Per-queue metrics

Here are some interesting links :

https://docs.aws.amazon.com/whitepapers/latest/introduction-aws-security/data-encryption.html

https://d1.awsstatic.com/events/reinvent/2019/REPEAT_2_Deep_dive_into_AWS_KMS_SEC322-R2.pdf

https://docs.aws.amazon.com/kms/latest/developerguide/services-dynamodb.html

https://aws.amazon.com/blogs/database/bring-your-own-encryption-keys-to-amazon-dynamodb/

https://docs.aws.amazon.com/kms/latest/developerguide/create-keys.html

AWS services that are integrated with AWS KMS use symmetric KMS keys to encrypt your data.

https://aws.amazon.com/kms/features/#AWS_Service_Integration

https://d0.awsstatic.com/whitepapers/aws-kms-best-practices.pdf

https://docs.aws.amazon.com/whitepapers/latest/logical-separation/logical-separation.pdf

https://aws.amazon.com/kms/faqs/


## Bring your own key
### User
The iam user used to run the AWS CLI commands has the following permissions :
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "kms:CreateAlias",
                "kms:CreateKey",
                "kms:DeleteAlias",
                "kms:Describe*",
                "kms:GenerateRandom",
                "kms:Get*",
                "kms:List*",
                "kms:TagResource",
                "kms:UntagResource",
                "iam:ListGroups",
                "iam:ListRoles",
                "iam:ListUsers",
                "kms:ImportKeyMaterial",
                "kms:PutKeyPolicy",
                "kms:UpdateAlias"
        ],
            "Resource": "*"
        }
    ]
}
```

### Create an AWS KMS external key
You need to create a KMS key with no key material.
We recommend 
- to set properly the main region. (The recommended region is Ireland - eu-west-1)
- to have a multi-region key

```
aws kms create-key --origin EXTERNAL --region eu-west-1 --multi-region \
  --description "An imported key generated via openssl"
  
```

```json
{
    "KeyMetadata": {
        "AWSAccountId": "999999999999",
        "KeyId": "mrk-99999999999999999999999999999999",
        "Arn": "arn:aws:kms:eu-west-1:999999999999:key/mrk-99999999999999999999999999999999",
        "CreationDate": "2023-03-24T13:45:28.978000+00:00",
        "Enabled": false,
        "Description": "An imported key generated via openssl",
        "KeyUsage": "ENCRYPT_DECRYPT",
        "KeyState": "PendingImport",
        "Origin": "EXTERNAL",
        "KeyManager": "CUSTOMER",
        "CustomerMasterKeySpec": "SYMMETRIC_DEFAULT",
        "KeySpec": "SYMMETRIC_DEFAULT",
        "EncryptionAlgorithms": [
            "SYMMETRIC_DEFAULT"
        ],
        "MultiRegion": true,
        "MultiRegionConfiguration": {
            "MultiRegionKeyType": "PRIMARY",
            "PrimaryKey": {
                "Arn": "arn:aws:kms:eu-west-1:999999999999:key/mrk-99999999999999999999999999999999",
                "Region": "eu-west-1"
            },
            "ReplicaKeys": []
        }
    }
}
```

```
aws kms create-alias \
  --alias alias/my-imported-encryption-key \
  --target-key-id mrk-99999999999999999999999999999999
```

You see that the origin of the key instance is __EXTERNAL__ and the key state is __PendingImport__.

### Generate the key material
You can use openssl to generate the key material in plain text.

<font color="red">Alternatively, if you consider openssl generated key material does not fit yuor security requirements AWS proposes a solution for production environment.</font>

See https://aws.amazon.com/blogs/security/how-to-byok-bring-your-own-key-to-aws-kms-for-less-than-15-00-a-year-using-aws-cloudhsm/

```
openssl rand -out PlaintextKeyMaterial.bin 32
```

### Get the public key and import token in the correct format

The jq tool must be installed.

```bash
#!/bin/sh
# working with 
#   aws-cli/2.11.17 
#   Python/3.11.3 
#   Linux/4.14.314-237.533.amzn2.x86_64 
#   exe/x86_64.amzn.2 
#   jq - commandline JSON processor [version 1.5]

# Get parameters for import in json format into parameters variable
parameters=$(aws kms get-parameters-for-import --key-id mrk-99999999999999999999999999999999 --wrapping-algorithm RSAES_OAEP_SHA_1 --wrapping-key-spec RSA_2048 )
# Extract public key value form json response
public_key=$(echo "$parameters" | jq -r '.PublicKey')
# Extract import token value form json response
import_token=$(echo "$parameters" | jq -r '.ImportToken')
# Create a tmp directory
mkdir tmp >/dev/null 2>&1
# Copy public key into tmp/PublicKey.b64 file
echo "$public_key" > tmp/PublicKey.b64
# Copy import token into tmp/ImportToken.b64 file
echo "$import_token" > tmp/ImportToken.b64
# decode base64
openssl enc -d -base64 -A -in tmp/PublicKey.b64 -out tmp/PublicKey.bin
# decode base64
openssl enc -d -base64 -A -in tmp/ImportToken.b64 -out tmp/ImportToken.bin
# encode plain text key material with public key
openssl pkeyutl -in PlaintextKeyMaterial.bin -out EncryptedKeyMaterial.bin -inkey tmp/PublicKey.bin -keyform DER -pubin -encrypt -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha1
```


Copy the base64 encoded public key, paste it into a new file, and then save the file. Give the file a descriptive name, such as PublicKey.b64.

Copy the base64 encoded import token, paste it into a new file, and then save the file. Give the file a descriptive name, for example ImportToken.b64.

Use OpenSSL to base64 decode the file's contents and save the decoded data to a new file. The following example decodes the data in the file that you saved in the previous step (PublicKey.b64) and saves the output to a new file named PublicKey.bin


Use OpenSSL to base64 decode the file's contents and save the decoded data to a new file. The following example decodes the data in the file that you saved in the previous step (ImportToken.b64) and saves the output to a new file named ImportToken.bin.

Encrypt the key material with the public key

### Import the key material into the KMS key instance

```bash
aws kms import-key-material --key-id mrk-99999999999999999999999999999999 \
    --encrypted-key-material fileb://EncryptedKeyMaterial.bin \
    --import-token fileb://tmp/ImportToken.bin \
    --expiration-model KEY_MATERIAL_DOES_NOT_EXPIRE
```

Control if the import of the key materiel is correct.

```
aws kms describe-key --key-id mrk-99999999999999999999999999999999
```

```json
{
    "KeyMetadata": {
        "AWSAccountId": "999999999999",
        "KeyId": "mkr-99999999999999999999999999999999",
        "Arn": "arn:aws:kms:eu-west-1:999999999999:key/mkr-99999999999999999999999999999999",
        "CreationDate": "2023-03-24T13:45:28.978000+00:00",
        "Enabled": true,
        "Description": "An imported key generated via openssl",
        "KeyUsage": "ENCRYPT_DECRYPT",
        "KeyState": "Enabled",
        "Origin": "EXTERNAL",
        "ExpirationModel": "KEY_MATERIAL_DOES_NOT_EXPIRE",
        "KeyManager": "CUSTOMER",
        "CustomerMasterKeySpec": "SYMMETRIC_DEFAULT",
        "KeySpec": "SYMMETRIC_DEFAULT",
        "EncryptionAlgorithms": [
            "SYMMETRIC_DEFAULT"
        ],
        "MultiRegion": true,
        "MultiRegionConfiguration": {
            "MultiRegionKeyType": "PRIMARY",
            "PrimaryKey": {
                "Arn": "arn:aws:kms:eu-west-1:126027396100:key/mrk-99999999999999999999999999999999",
                "Region": "eu-west-1"
            },
            "ReplicaKeys": []
        }
    }
}
```
You should have _Enabled_ set to true, the _KeyState_ set to Enabled.


## Deploy the CDK resources

The purpose of this exercice is not to give a cursus on CDK. We are supposing that you can deploy resources properly.
So, go to the root directory and run cdk deploy.
The code has been developed in typescript (nodejs 16).

You can test the application with command (with your accountid and your region):

```
aws sqs send-message \
    --queue-url https://sqs.eu-west-1.amazonaws.com/999999999999/PocQueue \
    --message-body "This is my message body"
```
You should see in the DynamoDB table message an entry with _This is my message body_.


## Improvement of the security

### Manage the key policy

>__Important__
Do not set the Principal to an asterisk (*) in any key policy statement that allows permissions unless you use conditions to limit the key policy. An asterisk gives every identity in every AWS account permission to use the KMS key, unless another policy statement explicitly denies it. Users in other AWS accounts can use your KMS key whenever they have corresponding permissions in their own account.

### The key policy

If you look at the key policy of the AWS KMS Key, you will see that it's the default key policy allowing all trusted entities (users/roles) to interact with the key.
This must be restricted and segragated between the management and the usage of the key.

See https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html

Here is an example of key policy :

```json
{
    "Version": "2012-10-17",
    "Id": "key-default-1",
    "Statement": [
        {
            "Sid": "Allow access for Key Administrators",
            "Effect": "Allow",
            "Principal": { "AWS": "arn:aws:iam::999999999999:role/DevOpsRole" },
            "Action": [
                "kms:Create*",
                "kms:Describe*",
                "kms:Enable*",
                "kms:List*",
                "kms:Put*",
                "kms:Update*",
                "kms:Revoke*",
                "kms:Disable*",
                "kms:Get*",
                "kms:Delete*",
                "kms:TagResource",
                "kms:UntagResource",
                "kms:ScheduleKeyDeletion",
                "kms:CancelKeyDeletion"
            ],
            "Resource": "*"
        },
        {
            "Sid": "Allow use of the key for Lambda role",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::999999999999:role/AwsQueueToDbPocStack-indexServiceRole2647F098-6I7UJ320VES7"
                ]
            },
            "Action": [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:ReEncrypt*",
                "kms:GenerateDataKey*",
                "kms:DescribeKey"
            ],
            "Resource": "*"
        },
        {
            "Sid": "Allow decryption/encryption with the key",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::999999999999:role/DevOpsRole"
                ]
            },
            "Action": [
                "kms:Encrypt",
                "kms:Decrypt",
                "kms:GenerateDataKey"
            ],
            "Resource": "*"
        }
    ]
}
```
For deploying this example, we were assuming the DevOpsRole, it's the reason for using it as principal for the administration and for writing and reading for the test.
The role of the lambda is receiving the permissions for using the key but not managing it.

>__Important__ Be careful to not delete the DevOpsRole, you will lose the control of the key policy.
There is a complex procedure to recover it. You have to open a support ticket with AWS.


```
aws kms put-key-policy \
    --policy-name default \
    --key-id mrk-99999999999999999999999999999999 \
    --policy file://src/policy/key_policy.json
```



#### What should be improved to be production ready
- The generation of the key material (not it's import) made via openssl (depending on the version) could be considered in some cases as weak.
- The permission for the administration of the key is too lax
    - creating a specific role to admin the keys in the account and a group in our authentication account to assume that role
- We should block the possibility to use the role in another lamba (it's the role that has the permission to decrypt)
