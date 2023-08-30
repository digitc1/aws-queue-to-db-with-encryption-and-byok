#!/bin/sh
## working with 
##   aws-cli/2.11.17 
##   Python/3.11.3 
##   Linux/4.14.314-237.533.amzn2.x86_64 
##   exe/x86_64.amzn.2 
##   jq - commandline JSON processor [version 1.5]
#
## Get parameters for import in json format into parameters variable
parameters=$(aws kms get-parameters-for-import --key-id mrk-9999999999999999999999999999999 --wrapping-algorithm RSAES_OAEP_SHA_1 --wrapping-key-spec RSA_2048 )
## Extract public key value form json response
public_key=$(echo "$parameters" | jq -r '.PublicKey')
## Extract import token value form json response
import_token=$(echo "$parameters" | jq -r '.ImportToken')
## Create a tmp directory
mkdir tmp >/dev/null 2>&1
## Copy public key into tmp/PublicKey.b64 file
echo "$public_key" > tmp/PublicKey.b64
## Copy import token into tmp/ImportToken.b64 file
echo "$import_token" > tmp/ImportToken.b64
## decode base64
openssl enc -d -base64 -A -in tmp/PublicKey.b64 -out tmp/PublicKey.bin
## decode base64
openssl enc -d -base64 -A -in tmp/ImportToken.b64 -out tmp/ImportToken.bin
## encode plain text key material with public key
openssl pkeyutl -in PlaintextKeyMaterial.bin -out EncryptedKeyMaterial.bin -inkey tmp/PublicKey.bin -keyform DER -pubin -encrypt -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha1
