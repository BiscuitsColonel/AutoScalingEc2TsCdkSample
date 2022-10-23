#!/bin/bash

# S3バケットからassetsによって作成されたzipファイルを取得する
aws s3 cp --region ap-northeast-1 S3Bucket ./assets/

# zipファイルのPATHを取得
ZIPFILE=$(find assets -name "*.zip")

# zipを解凍する
unzip ${ZIPFILE}

# userdataのPATHを取得
USERDATA=$(find `pwd` -name "userdata.sh")

# userdata.shを実行する
chmod 755 ${USERDATA} && ${USERDATA}
