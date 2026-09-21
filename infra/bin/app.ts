#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { MangaStack } from '../lib/manga-stack'

const app = new cdk.App()

// この構成のSSM Parameter、S3、Lambdaは東京リージョンへ揃える。
// shellのAWS_DEFAULT_REGIONなどに左右されると、READMEどおりに登録したSSM値を
// Lambdaが読めなくなるため、regionは明示的に固定する。accountだけは利用者の環境から受け取る。
new MangaStack(app, 'MangaStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'ap-northeast-1',
    },
    description: 'Private manga viewer infrastructure',
})
