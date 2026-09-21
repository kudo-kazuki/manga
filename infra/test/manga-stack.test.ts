import * as path from 'node:path'
import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { beforeAll, describe, expect, it } from 'vitest'
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
        // 本番の大きなdistではなく、この小さなdirectoryを使ってasset hash計算を短縮する。
        frontendAssetPath: path.resolve(__dirname),
    })

    return Template.fromStack(stack).toJSON()
}

let synthesized: Record<string, unknown>
let template: Template

beforeAll(() => {
    // CDKの初回synthはasset hash計算に時間がかかるため、全テストで1回だけ共有する。
    synthesized = synthesizeTemplate()
    template = Template.fromJSON(synthesized)
}, 30_000)

describe('MangaStack', () => {
    it('非公開S3 BucketとOAC originを作成する', () => {
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

    it('漫画Bucketを保持し、Trusted Key Groupで漫画リクエストを保護する', () => {
        const typedTemplate = synthesized as {
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
        const resources = Object.entries(typedTemplate.Resources)
        const mangaBucket = resources.find(
            ([logicalId, resource]) =>
                logicalId.startsWith('MangaBucket') &&
                resource.Type === 'AWS::S3::Bucket',
        )?.[1]

        expect(mangaBucket).toBeDefined()
        expect(mangaBucket?.DeletionPolicy).toBe('Retain')
        expect(mangaBucket?.UpdateReplacePolicy).toBe('Retain')

        template.resourceCountIs('AWS::CloudFront::PublicKey', 1)
        template.resourceCountIs('AWS::CloudFront::KeyGroup', 1)
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
            DistributionConfig: {
                CacheBehaviors: Match.arrayWith([
                    Match.objectLike({
                        PathPattern: 'manga/*',
                        TrustedKeyGroups: Match.anyValue(),
                    }),
                ]),
            },
        })
    })

    it('HTTP APIとcache無効の/api/* Behaviorを作成する', () => {
        template.resourceCountIs('AWS::ApiGatewayV2::Api', 1)
        template.resourceCountIs('AWS::ApiGatewayV2::Route', 2)
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
            DistributionConfig: {
                CacheBehaviors: Match.arrayWith([
                    Match.objectLike({
                        PathPattern: 'api/*',
                        CachePolicyId: Match.anyValue(),
                    }),
                ]),
            },
        })
        const policyDefinitions = Object.values(
            (
                synthesized as {
                    Resources: Record<
                        string,
                        { Type: string; Properties?: unknown }
                    >
                }
            ).Resources,
        )
            .filter((resource) => resource.Type === 'AWS::IAM::Policy')
            .map((resource) => JSON.stringify(resource.Properties))
        const loginPolicy = policyDefinitions.find((definition) =>
            definition.includes('ssm:GetParameter'),
        )
        expect(loginPolicy).toContain('parameter/manga/viewer-password-hash')
        expect(loginPolicy).toContain('parameter/manga/cloudfront-private-key')
    })

    it('仕様で禁止されたAWSサービスを作成しない', () => {
        const typedTemplate = synthesized as {
            Resources: Record<string, { Type: string }>
        }
        const forbiddenTypes = Object.values(typedTemplate.Resources)
            .map((resource) => resource.Type)
            .filter((type) =>
                forbiddenResourcePrefixes.some((prefix) =>
                    type.startsWith(prefix),
                ),
            )

        expect(forbiddenTypes).toEqual([])
    })
})
