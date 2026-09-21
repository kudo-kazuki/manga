import { CfnParameter, aws_cloudfront as cloudfront } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export interface ViewerAuthResources {
    readonly publicKey: cloudfront.PublicKey
    readonly keyGroup: cloudfront.KeyGroup
}

export function createViewerAuth(scope: Construct): ViewerAuthResources {
    // 公開鍵はsecretではないが、実環境ごとに異なるためsourceへ固定しない。
    // deploy時に --parameters CloudFrontPublicKeyPem="..." で渡す。
    const publicKeyPem = new CfnParameter(scope, 'CloudFrontPublicKeyPem', {
        type: 'String',
        description:
            'PEM-encoded RSA public key used to verify CloudFront signed cookies',
    })
    const publicKey = new cloudfront.PublicKey(scope, 'MangaPublicKey', {
        encodedKey: publicKeyPem.valueAsString,
        comment: 'Public key for private manga signed cookies',
    })
    // Key Group方式を使い、廃止方向のLegacy Trusted Signerは使用しない。
    const keyGroup = new cloudfront.KeyGroup(scope, 'MangaKeyGroup', {
        items: [publicKey],
        comment: 'Trusted keys for /manga/*',
    })

    return { publicKey, keyGroup }
}
