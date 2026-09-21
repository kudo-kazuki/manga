import assert from 'node:assert/strict'
import { test } from 'node:test'
import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { MangaStack } from '../lib/manga-stack'

// 小規模・低コストという仕様から外れるサービスが、後の変更で紛れ込まないように監視する。
const forbiddenResourcePrefixes = [
    'AWS::EC2::',
    'AWS::ECS::',
    'AWS::ElasticLoadBalancingV2::',
    'AWS::RDS::',
    'AWS::DynamoDB::',
    'AWS::Cognito::',
    'AWS::ElastiCache::',
    'AWS::OpenSearchService::',
    'AWS::StepFunctions::',
]

function synthesizeTemplate(): Record<string, unknown> {
    // 実AWSへ接続せず、固定のダミーaccountでCloudFormationテンプレートだけを検査する。
    const app = new App()
    const stack = new MangaStack(app, 'TestMangaStack', {
        env: { account: '111111111111', region: 'ap-northeast-1' },
    })

    return Template.fromStack(stack).toJSON()
}

test('uses private S3 buckets and OAC origins', () => {
    const template = Template.fromJSON(synthesizeTemplate())

    template.resourceCountIs('AWS::S3::Bucket', 2)
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2)
    template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
            ServerSideEncryptionConfiguration: [
                {
                    ServerSideEncryptionByDefault: {
                        SSEAlgorithm: 'AES256',
                    },
                },
            ],
        },
        PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
        },
    })
})

test('retains the manga bucket and guards manga requests in phase one', () => {
    const synthesized = synthesizeTemplate() as {
        Resources: Record<
            string,
            {
                Type: string
                DeletionPolicy?: string
                UpdateReplacePolicy?: string
                Properties?: Record<string, unknown>
            }
        >
    }
    const resources = Object.entries(synthesized.Resources)
    const mangaBucket = resources.find(
        ([logicalId, resource]) =>
            logicalId.startsWith('MangaBucket') &&
            resource.Type === 'AWS::S3::Bucket',
    )?.[1]

    assert.ok(mangaBucket)
    assert.equal(mangaBucket.DeletionPolicy, 'Retain')
    assert.equal(mangaBucket.UpdateReplacePolicy, 'Retain')

    const functions = resources
        .filter(([, resource]) => resource.Type === 'AWS::CloudFront::Function')
        .map(([, resource]) => JSON.stringify(resource.Properties))
    assert.ok(functions.some((definition) => definition.includes('403')))
})

test('does not synthesize prohibited services', () => {
    const synthesized = synthesizeTemplate() as {
        Resources: Record<string, { Type: string }>
    }
    const forbiddenTypes = Object.values(synthesized.Resources)
        .map((resource) => resource.Type)
        .filter((type) =>
            forbiddenResourcePrefixes.some((prefix) => type.startsWith(prefix)),
        )

    assert.deepEqual(forbiddenTypes, [])
})
