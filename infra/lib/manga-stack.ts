import * as path from 'node:path'
import {
    CfnOutput,
    Stack,
    StackProps,
    aws_cloudfront as cloudfront,
    aws_s3_deployment as s3deploy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { createDistribution } from './distribution'
import { createStorage } from './storage'

export class MangaStack extends Stack {
    public constructor(scope: Construct, id: string, props: StackProps = {}) {
        super(scope, id, props)

        const { frontendBucket, mangaBucket } = createStorage(this)
        const distribution = createDistribution(this, {
            frontendBucket,
            mangaBucket,
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
                    path.resolve(__dirname, '../../frontend/dist'),
                ),
            ],
        })

        this.addOutputs(
            distribution,
            frontendBucket.bucketName,
            mangaBucket.bucketName,
        )
    }

    private addOutputs(
        distribution: cloudfront.Distribution,
        frontendBucketName: string,
        mangaBucketName: string,
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
    }
}
