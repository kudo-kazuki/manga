import {
    Duration,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3 as s3,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export interface MangaDistributionProps {
    readonly frontendBucket: s3.IBucket
    readonly mangaBucket: s3.IBucket
}

export function createDistribution(
    scope: Construct,
    props: MangaDistributionProps,
): cloudfront.Distribution {
    // Vue Routerのhistory modeでは実ファイルを持たないURLが使われる。
    // 拡張子のないSPAルートだけをindex.htmlへ書き換え、APIや漫画パスのエラーは隠さない。
    const spaRewriteFunction = new cloudfront.Function(
        scope,
        'SpaRewriteFunction',
        {
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    if (uri.indexOf('/api/') === 0 || uri.indexOf('/manga/') === 0) {
        return request;
    }

    var finalSegment = uri.substring(uri.lastIndexOf('/') + 1);
    if (uri.charAt(uri.length - 1) === '/') {
        request.uri = uri + 'index.html';
    } else if (finalSegment.indexOf('.') === -1) {
        request.uri = '/index.html';
    }

    return request;
}
`),
        },
    )

    // Phase 1ではSigned Cookieがまだ存在しない。
    // OAC構成を先にsynth可能にしつつ漫画を公開しないため、/manga/*は常に403で閉じておく。
    // Phase 2でTrusted Key Groupを追加した時点で、この一時ガードを置き換える。
    const phaseOneMangaGuard = new cloudfront.Function(
        scope,
        'PhaseOneMangaGuard',
        {
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            code: cloudfront.FunctionCode.fromInline(`
function handler() {
    return {
        statusCode: 403,
        statusDescription: 'Forbidden',
        headers: {
            'cache-control': { value: 'no-store' },
            'content-type': { value: 'text/plain; charset=utf-8' }
        },
        body: 'Manga access is disabled until signed-cookie authentication is configured.'
    };
}
`),
        },
    )

    // OAIではなくOACを使用する。CDKがDistribution限定のBucket Policyも生成する。
    const frontendOrigin = origins.S3BucketOrigin.withOriginAccessControl(
        props.frontendBucket,
    )
    const mangaOrigin = origins.S3BucketOrigin.withOriginAccessControl(
        props.mangaBucket,
    )

    return new cloudfront.Distribution(scope, 'Distribution', {
        comment: 'Private manga viewer',
        defaultRootObject: 'index.html',
        enableIpv6: true,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        defaultBehavior: {
            origin: frontendOrigin,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            compress: true,
            responseHeadersPolicy:
                cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
            viewerProtocolPolicy:
                cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            functionAssociations: [
                {
                    eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                    function: spaRewriteFunction,
                },
            ],
        },
        additionalBehaviors: {
            'manga/*': {
                origin: mangaOrigin,
                allowedMethods:
                    cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cachePolicy: new cloudfront.CachePolicy(
                    scope,
                    'MangaCachePolicy',
                    {
                        // 画像は原則不変なので長期キャッシュを許可する。
                        // metadata/index用の短期キャッシュBehaviorはPhase 5で追加する。
                        minTtl: Duration.seconds(0),
                        defaultTtl: Duration.hours(1),
                        maxTtl: Duration.days(365),
                        enableAcceptEncodingBrotli: true,
                        enableAcceptEncodingGzip: true,
                    },
                ),
                compress: true,
                responseHeadersPolicy:
                    cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                viewerProtocolPolicy:
                    cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                functionAssociations: [
                    {
                        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                        function: phaseOneMangaGuard,
                    },
                ],
            },
        },
    })
}
