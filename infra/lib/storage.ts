import { RemovalPolicy, aws_s3 as s3 } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export interface MangaStorageResources {
    readonly frontendBucket: s3.Bucket
    readonly mangaBucket: s3.Bucket
}

export function createStorage(
    scope: Construct,
    uploadAllowedOrigin: string,
): MangaStorageResources {
    // SPA用・漫画用のどちらもS3単体では公開せず、CloudFrontのOAC経由だけで配信する。
    // バケット名は自動生成にして、環境ごとの名前衝突を避ける。
    const commonBucketProps = {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        publicReadAccess: false,
        versioned: false,
    } satisfies Pick<
        s3.BucketProps,
        | 'blockPublicAccess'
        | 'encryption'
        | 'enforceSSL'
        | 'objectOwnership'
        | 'publicReadAccess'
        | 'versioned'
    >

    const frontendBucket = new s3.Bucket(scope, 'FrontendBucket', {
        ...commonBucketProps,
        // SPAはビルドし直せるため、Stack削除時にCDKの管理下で片付けてよい。
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
    })

    const mangaBucket = new s3.Bucket(scope, 'MangaBucket', {
        ...commonBucketProps,
        // 漫画画像は再生成できないデータなので、cdk destroyやStack置換でも絶対に連動削除しない。
        autoDeleteObjects: false,
        removalPolicy: RemovalPolicy.RETAIN,
        // Presigned PUTだけはBrowserからS3へ直接送るため、PUTとContent-Typeだけを許可する。
        // 本番OriginはCloudFormation Parameterで明示し、'*'は使用しない。
        // Viteの開発serverからも同じ実AWSへE2E確認できるようlocalhostだけを追加許可する。
        cors: [
            {
                allowedOrigins: [
                    uploadAllowedOrigin,
                    'http://localhost:4646',
                ],
                allowedMethods: [s3.HttpMethods.PUT],
                allowedHeaders: ['content-type', 'cache-control'],
                maxAge: 900,
            },
        ],
    })

    return { frontendBucket, mangaBucket }
}
