import * as path from 'node:path'
import {
    CfnParameter,
    CfnOutput,
    Stack,
    StackProps,
    aws_cloudfront as cloudfront,
    aws_s3_deployment as s3deploy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { createMangaApi } from './api'
import { createViewerAuth } from './auth'
import { createDistribution } from './distribution'
import { createStorage } from './storage'

export interface MangaStackProps extends StackProps {
    /** テスト時だけ小さなasset directoryへ差し替えられる。通常はfrontend/distを使用する。 */
    readonly frontendAssetPath?: string
    readonly viewerPasswordParameterName?: string
    readonly cloudFrontPrivateKeyParameterName?: string
    readonly signedCookieTtlSeconds?: number
    readonly adminPasswordParameterName?: string
    readonly adminSigningKeyParameterName?: string
    readonly adminSessionTtlSeconds?: number
}

export class MangaStack extends Stack {
    public constructor(
        scope: Construct,
        id: string,
        props: MangaStackProps = {},
    ) {
        super(scope, id, props)

        // CloudFront標準domainはDistribution作成後に決まるため、初回はlocalhostでdeployし、
        // OutputされたSiteUrlを指定して再deployできる明示的な2段階方式にする。
        const uploadAllowedOrigin = new CfnParameter(
            this,
            'UploadAllowedOrigin',
            {
                type: 'String',
                default: 'http://localhost:4646',
                description:
                    'Exact browser origin allowed to upload directly to S3; never use *',
            },
        )
        const { frontendBucket, mangaBucket } = createStorage(
            this,
            uploadAllowedOrigin.valueAsString,
        )
        const { publicKey, keyGroup } = createViewerAuth(this)
        const { httpApi } = createMangaApi(this, {
            cloudFrontKeyPairId: publicKey.publicKeyId,
            viewerPasswordParameterName:
                props.viewerPasswordParameterName ??
                '/manga/viewer-password-hash',
            cloudFrontPrivateKeyParameterName:
                props.cloudFrontPrivateKeyParameterName ??
                '/manga/cloudfront-private-key',
            signedCookieTtlSeconds:
                props.signedCookieTtlSeconds ?? 24 * 60 * 60,
            adminPasswordParameterName:
                props.adminPasswordParameterName ??
                '/manga/admin-password-hash',
            adminSigningKeyParameterName:
                props.adminSigningKeyParameterName ??
                '/manga/admin-signing-key',
            adminSessionTtlSeconds: props.adminSessionTtlSeconds ?? 60 * 60,
            mangaBucket,
            presignedUrlTtlSeconds: 15 * 60,
        })
        const distribution = createDistribution(this, {
            frontendBucket,
            mangaBucket,
            httpApi,
            mangaKeyGroup: keyGroup,
        })

        // 漫画画像はCDK assetへ含めない。ここで配布するのはfrontend/distのSPA成果物だけ。
        // distributionPathsを指定し、SPA更新後に古いindex.htmlが残らないようにする。
        new s3deploy.BucketDeployment(this, 'DeployFrontend', {
            destinationBucket: frontendBucket,
            distribution,
            distributionPaths: ['/*'],
            prune: true,
            sources: [
                s3deploy.Source.asset(
                    props.frontendAssetPath ??
                        path.resolve(__dirname, '../../frontend/dist'),
                ),
            ],
        })

        this.addOutputs(
            distribution,
            frontendBucket.bucketName,
            mangaBucket.bucketName,
            httpApi.apiEndpoint,
        )
    }

    private addOutputs(
        distribution: cloudfront.Distribution,
        frontendBucketName: string,
        mangaBucketName: string,
        apiEndpoint: string,
    ): void {
        // 初期構築は独自ドメインを必須にしないため、CloudFront標準URLを正規の接続先として出力する。
        new CfnOutput(this, 'SiteUrl', {
            description: 'CloudFront URL for the manga viewer',
            value: `https://${distribution.distributionDomainName}`,
        })
        new CfnOutput(this, 'DistributionId', {
            value: distribution.distributionId,
        })
        new CfnOutput(this, 'FrontendBucketName', {
            value: frontendBucketName,
        })
        new CfnOutput(this, 'MangaBucketName', {
            description:
                'Retained bucket; deleting the stack does not delete it',
            value: mangaBucketName,
        })
        new CfnOutput(this, 'ApiEndpoint', {
            description:
                'Direct HTTP API endpoint; normal browser use should go through CloudFront /api/*',
            value: apiEndpoint,
        })
    }
}
