from datetime import datetime
import boto3
from credential_aws import *

s3 = boto3.client(
    's3',
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name=REGION_NAME
)

print("creating temporary bucket")
bucket_name = "for_redshift_upload_{}".format(datetime.timestamp(datetime.now()))
s3.create_bucket(Bucket=bucket_name)

for dirname, dirs, files in os.walk(idir):
    for filename in files:
#s3.delete_bucket(Bucket=bucket_name)
