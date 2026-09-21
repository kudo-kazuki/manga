import * as path from 'node:path'
import {
    ArnFormat,
    Duration,
    RemovalPolicy,
    Stack,
    aws_apigatewayv2 as apigatewayv2,
    aws_iam as iam,
    aws_lambda as lambda,
    aws_lambda_nodejs as lambdaNodejs,
    aws_logs as logs,
    aws_s3 as s3,
} from 'aws-cdk-lib'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { Construct } from 'constructs'

export interface MangaApiProps {
    readonly cloudFrontKeyPairId: string
    readonly viewerPasswordParameterName: string
    readonly cloudFrontPrivateKeyParameterName: string
    readonly signedCookieTtlSeconds: number
    readonly adminPasswordParameterName: string
    readonly adminSigningKeyParameterName: string
    readonly adminSessionTtlSeconds: number
    readonly mangaBucket: s3.IBucket
    readonly presignedUrlTtlSeconds: number
}

export interface MangaApiResources {
    readonly httpApi: apigatewayv2.HttpApi
}

function parameterArn(scope: Construct, parameterName: string): string {
    // IAM ARNでは先頭slashをresourceName側へ含めない。
    return Stack.of(scope).formatArn({
        service: 'ssm',
        resource: 'parameter',
        resourceName: parameterName.replace(/^\/+/, ''),
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    })
}

function createFunction(
    scope: Construct,
    id: string,
    entry: string,
    environment: Record<string, string> = {},
    timeoutSeconds = 5,
): lambdaNodejs.NodejsFunction {
    // CDK既定の無期限ログを避け、小規模サイトに十分な1週間だけ保持する。
    const logGroup = new logs.LogGroup(scope, `${id}LogGroup`, {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
    })

    // 認証処理は軽量なので、低コストのarm64・128MB・短いtimeoutで動かす。
    return new lambdaNodejs.NodejsFunction(scope, id, {
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        entry,
        handler: 'handler',
        memorySize: 128,
        timeout: Duration.seconds(timeoutSeconds),
        logGroup,
        environment,
        bundling: {
            minify: true,
            sourceMap: false,
            target: 'node24',
        },
        // entryがbackend配下にあるため、依存解決にもbackendのlockfileを使う。
        depsLockFilePath: path.resolve(
            __dirname,
            '../../backend/package-lock.json',
        ),
    })
}

export function createMangaApi(
    scope: Construct,
    props: MangaApiProps,
): MangaApiResources {
    const backendRoot = path.resolve(__dirname, '../../backend')
    // LoginだけがSSMと秘密鍵を必要とする。Logoutには秘密情報を渡さない。
    const loginFunction = createFunction(
        scope,
        'ViewerLoginFunction',
        path.join(backendRoot, 'functions/login.ts'),
        {
            VIEWER_PASSWORD_PARAMETER_NAME: props.viewerPasswordParameterName,
            CLOUDFRONT_PRIVATE_KEY_PARAMETER_NAME:
                props.cloudFrontPrivateKeyParameterName,
            CLOUDFRONT_KEY_PAIR_ID: props.cloudFrontKeyPairId,
            SIGNED_COOKIE_TTL_SECONDS: String(props.signedCookieTtlSeconds),
        },
    )
    // 全Parameterの取得は許可せず、閲覧認証に必要な2件だけへ絞る。
    loginFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                parameterArn(scope, props.viewerPasswordParameterName),
                parameterArn(scope, props.cloudFrontPrivateKeyParameterName),
            ],
        }),
    )

    const logoutFunction = createFunction(
        scope,
        'ViewerLogoutFunction',
        path.join(backendRoot, 'functions/logout.ts'),
    )

    const adminLoginFunction = createFunction(
        scope,
        'AdminLoginFunction',
        path.join(backendRoot, 'functions/admin-login.ts'),
        {
            ADMIN_PASSWORD_PARAMETER_NAME: props.adminPasswordParameterName,
            ADMIN_SIGNING_KEY_PARAMETER_NAME:
                props.adminSigningKeyParameterName,
            ADMIN_SESSION_TTL_SECONDS: String(props.adminSessionTtlSeconds),
        },
    )
    // 管理Loginも、自分が使うpassword導出値とCookie署名鍵だけを取得できる。
    adminLoginFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                parameterArn(scope, props.adminPasswordParameterName),
                parameterArn(scope, props.adminSigningKeyParameterName),
            ],
        }),
    )
    const adminLogoutFunction = createFunction(
        scope,
        'AdminLogoutFunction',
        path.join(backendRoot, 'functions/admin-logout.ts'),
    )
    const adminSessionFunction = createFunction(
        scope,
        'AdminSessionFunction',
        path.join(backendRoot, 'functions/admin-session.ts'),
        {
            // 共通config loaderを使うため名前は両方渡すが、このLambdaが読む値は署名鍵だけ。
            ADMIN_PASSWORD_PARAMETER_NAME: props.adminPasswordParameterName,
            ADMIN_SIGNING_KEY_PARAMETER_NAME:
                props.adminSigningKeyParameterName,
            ADMIN_SESSION_TTL_SECONDS: String(props.adminSessionTtlSeconds),
        },
    )
    adminSessionFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                parameterArn(scope, props.adminSigningKeyParameterName),
            ],
        }),
    )
    const presignFunction = createFunction(
        scope,
        'PresignFunction',
        path.join(backendRoot, 'functions/presign.ts'),
        {
            MANGA_BUCKET_NAME: props.mangaBucket.bucketName,
            ADMIN_SIGNING_KEY_PARAMETER_NAME:
                props.adminSigningKeyParameterName,
            PRESIGNED_URL_TTL_SECONDS: String(props.presignedUrlTtlSeconds),
        },
    )
    presignFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                parameterArn(scope, props.adminSigningKeyParameterName),
            ],
        }),
    )
    // Lambdaが署名できるPUT先もmanga/ prefixだけに限定する。
    props.mangaBucket.grantPut(presignFunction, 'manga/*')
    const completeUploadFunction = createFunction(
        scope,
        'CompleteUploadFunction',
        path.join(backendRoot, 'functions/complete-upload.ts'),
        {
            MANGA_BUCKET_NAME: props.mangaBucket.bucketName,
            ADMIN_SIGNING_KEY_PARAMETER_NAME:
                props.adminSigningKeyParameterName,
        },
        // 最大10万件のKeyをpagination付きで確認するため、認証Lambdaより余裕を持たせる。
        30,
    )
    completeUploadFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['ssm:GetParameter'],
            resources: [
                parameterArn(scope, props.adminSigningKeyParameterName),
            ],
        }),
    )
    completeUploadFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['s3:ListBucket'],
            resources: [props.mangaBucket.bucketArn],
            conditions: { StringLike: { 's3:prefix': ['manga/*'] } },
        }),
    )
    completeUploadFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [props.mangaBucket.arnForObjects('manga/index.json')],
        }),
    )
    completeUploadFunction.addToRolePolicy(
        new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [
                props.mangaBucket.arnForObjects('manga/index.json'),
                props.mangaBucket.arnForObjects('manga/*/metadata.json'),
            ],
        }),
    )

    // 高機能で単価も高いREST APIではなく、仕様どおりHTTP APIを使用する。
    const httpApi = new apigatewayv2.HttpApi(scope, 'MangaHttpApi', {
        apiName: 'private-manga-api',
        createDefaultStage: true,
        description: 'Authentication and upload helpers for the manga viewer',
    })
    httpApi.addRoutes({
        path: '/api/login',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'ViewerLoginIntegration',
            loginFunction,
        ),
    })
    httpApi.addRoutes({
        path: '/api/admin/login',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'AdminLoginIntegration',
            adminLoginFunction,
        ),
    })
    httpApi.addRoutes({
        path: '/api/admin/logout',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'AdminLogoutIntegration',
            adminLogoutFunction,
        ),
    })
    httpApi.addRoutes({
        path: '/api/admin/session',
        methods: [apigatewayv2.HttpMethod.GET],
        integration: new HttpLambdaIntegration(
            'AdminSessionIntegration',
            adminSessionFunction,
        ),
    })
    httpApi.addRoutes({
        path: '/api/upload/presign',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'PresignIntegration',
            presignFunction,
        ),
    })
    httpApi.addRoutes({
        path: '/api/upload/complete',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'CompleteUploadIntegration',
            completeUploadFunction,
        ),
    })

    // DBなしの簡易認証なので、API全体へ小さなthrottleを設けて連続試行を抑える。
    // 数人だけのサイトでは5 req/s、burst 10で通常操作を妨げない。
    const defaultStage = httpApi.defaultStage?.node
        .defaultChild as apigatewayv2.CfnStage
    defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 10,
        throttlingRateLimit: 5,
    }
    httpApi.addRoutes({
        path: '/api/logout',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'ViewerLogoutIntegration',
            logoutFunction,
        ),
    })

    return { httpApi }
}
