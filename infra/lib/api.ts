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
} from 'aws-cdk-lib'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { Construct } from 'constructs'

export interface MangaApiProps {
    readonly cloudFrontKeyPairId: string
    readonly viewerPasswordParameterName: string
    readonly cloudFrontPrivateKeyParameterName: string
    readonly signedCookieTtlSeconds: number
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
        timeout: Duration.seconds(5),
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
        path: '/api/logout',
        methods: [apigatewayv2.HttpMethod.POST],
        integration: new HttpLambdaIntegration(
            'ViewerLogoutIntegration',
            logoutFunction,
        ),
    })

    return { httpApi }
}
