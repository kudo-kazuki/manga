#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { MangaStack } from '../lib/manga-stack'

const app = new cdk.App()

// AWS CLIやSSOから渡されたリージョンを優先し、未指定時は東京リージョンを使う。
// accountをコードへ固定しないことで、秘密情報や個人のAWS設定をリポジトリへ持ち込まない。
new MangaStack(app, 'MangaStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
    },
    description: 'Private manga viewer infrastructure',
})
