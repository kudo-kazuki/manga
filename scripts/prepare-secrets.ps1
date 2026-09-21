$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $repositoryRoot 'secrets'
$hashScript = Join-Path $repositoryRoot 'backend\scripts\hash-password.mjs'
$signingKeyScript = Join-Path $repositoryRoot 'backend\scripts\generate-signing-key.mjs'
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)

New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null

function ConvertTo-PlainText {
    param([Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Invoke-NodeWithSecretStdin {
    param(
        [string]$ScriptPath,
        [string]$SecretValue
    )

    # 平文passwordをcommand line引数へ載せず、子processのstdinだけへ短時間渡す。
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'node'
    # Windows PowerShell 5.1でも動くよう、.NET Core専用のArgumentListは使わない。
    $startInfo.Arguments = '"' + $ScriptPath + '"'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $process.StandardInput.Write($SecretValue)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd().Trim()
    $errorOutput = $process.StandardError.ReadToEnd().Trim()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "Secret生成に失敗しました: $errorOutput"
    }
    return $output
}

function New-PasswordHashFile {
    param(
        [string]$Prompt,
        [string]$OutputPath
    )

    $securePassword = Read-Host $Prompt -AsSecureString
    $plainPassword = ConvertTo-PlainText $securePassword
    try {
        $hash = Invoke-NodeWithSecretStdin -ScriptPath $hashScript -SecretValue $plainPassword
        # Windows PowerShell 5.1のutf8出力はBOM付きなので、hash形式の先頭を壊さないよう明示する。
        [IO.File]::WriteAllText($OutputPath, $hash, $utf8WithoutBom)
    }
    finally {
        $plainPassword = $null
        $securePassword.Dispose()
    }
}

New-PasswordHashFile `
    -Prompt '閲覧用password（12文字以上、管理用とは別）' `
    -OutputPath (Join-Path $secretDirectory 'viewer-password-hash.txt')
New-PasswordHashFile `
    -Prompt '管理用password（12文字以上、閲覧用とは別）' `
    -OutputPath (Join-Path $secretDirectory 'admin-password-hash.txt')

$adminSigningKey = & node $signingKeyScript
[IO.File]::WriteAllText(
    (Join-Path $secretDirectory 'admin-signing-key.txt'),
    $adminSigningKey.Trim(),
    $utf8WithoutBom
)

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw 'OpenSSLが見つかりません。CloudFront鍵生成のためOpenSSLをinstallしてください。'
}

$privateKeyPath = Join-Path $secretDirectory 'cloudfront-private.pem'
$publicKeyPath = Join-Path $secretDirectory 'cloudfront-public.pem'
& openssl genrsa -out $privateKeyPath 2048
if ($LASTEXITCODE -ne 0) { throw 'CloudFront秘密鍵の生成に失敗しました。' }
& openssl rsa -pubout -in $privateKeyPath -out $publicKeyPath
if ($LASTEXITCODE -ne 0) { throw 'CloudFront公開鍵の生成に失敗しました。' }

Write-Host "秘密情報を $secretDirectory に生成しました。"
Write-Host 'このdirectoryはGitで無視されますが、CloudFront秘密鍵は別媒体にも安全にbackupしてください。'
