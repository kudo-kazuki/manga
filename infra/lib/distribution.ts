import {
    Duration,
    Fn,
    aws_apigatewayv2 as apigatewayv2,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3 as s3,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export interface MangaDistributionProps {
    readonly frontendBucket: s3.IBucket
    readonly mangaBucket: s3.IBucket
    readonly httpApi: apigatewayv2.IHttpApi
    readonly mangaKeyGroup: cloudfront.IKeyGroup
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

    // API GatewayのHostではなく、実際に利用者が開いたCloudFront hostをLogin Lambdaへ渡す。
    // Lambdaはこの値を/manga/*だけに限定したSigned Cookie policyへ使用する。
    const apiViewerHostFunction = new cloudfront.Function(
        scope,
        'ApiViewerHostFunction',
        {
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
    var request = event.request;
    request.headers['x-manga-viewer-host'] = { value: request.headers.host.value };
    return request;
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
    const apiDomainName = Fn.select(2, Fn.split('/', props.httpApi.apiEndpoint))
    const apiOrigin = new origins.HttpOrigin(apiDomainName, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    })
    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(
        scope,
        'ApiOriginRequestPolicy',
        {
            cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
            headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
                'content-type',
                'x-manga-viewer-host',
            ),
            queryStringBehavior:
                cloudfront.OriginRequestQueryStringBehavior.all(),
        },
    )
    const mangaImageCachePolicy = new cloudfront.CachePolicy(
        scope,
        'MangaImageCachePolicy',
        {
            // 画像は同じKeyで更新しない前提なので、Browser/S3の長期cacheと整合させる。
            minTtl: Duration.seconds(0),
            defaultTtl: Duration.hours(1),
            maxTtl: Duration.days(365),
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true,
        },
    )
    const mangaMetadataCachePolicy = new cloudfront.CachePolicy(
        scope,
        'MangaMetadataCachePolicy',
        {
            // index/metadata更新後に長時間古い一覧を返さないよう、画像とはpolicyを分ける。
            minTtl: Duration.seconds(0),
            defaultTtl: Duration.minutes(1),
            maxTtl: Duration.minutes(1),
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true,
        },
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
            'api/*': {
                origin: apiOrigin,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                compress: true,
                originRequestPolicy: apiOriginRequestPolicy,
                responseHeadersPolicy:
                    cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                viewerProtocolPolicy:
                    cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                functionAssociations: [
                    {
                        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                        function: apiViewerHostFunction,
                    },
                ],
            },
            'manga/index.json': {
                origin: mangaOrigin,
                allowedMethods:
                    cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cachePolicy: mangaMetadataCachePolicy,
                compress: true,
                responseHeadersPolicy:
                    cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                viewerProtocolPolicy:
                    cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                trustedKeyGroups: [props.mangaKeyGroup],
            },
            'manga/*/metadata.json': {
                origin: mangaOrigin,
                allowedMethods:
                    cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cachePolicy: mangaMetadataCachePolicy,
                compress: true,
                responseHeadersPolicy:
                    cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                viewerProtocolPolicy:
                    cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                trustedKeyGroups: [props.mangaKeyGroup],
            },
            'manga/*': {
                origin: mangaOrigin,
                allowedMethods:
                    cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cachePolicy: mangaImageCachePolicy,
                compress: true,
                responseHeadersPolicy:
                    cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
                viewerProtocolPolicy:
                    cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                trustedKeyGroups: [props.mangaKeyGroup],
            },
        },
    })
}
