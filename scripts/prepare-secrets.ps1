[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $repositoryRoot 'secrets'
$hashScript = Join-Path $repositoryRoot 'backend\scripts\hash-password.mjs'
$signingKeyScript = Join-Path $repositoryRoot 'backend\scripts\generate-signing-key.mjs'
$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
$secretFileNames = @(
    'viewer-password-hash.txt',
    'admin-password-hash.txt',
    'admin-signing-key.txt',
    'cloudfront-private.pem',
    'cloudfront-public.pem'
)

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

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.jsが見つかりません。先にNode.js 24をinstallしてください。'
}
if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw 'OpenSSLが見つかりません。CloudFront鍵生成のためOpenSSLをinstallしてください。'
}

$existingFiles = @(
    $secretFileNames |
        ForEach-Object { Join-Path $secretDirectory $_ } |
        Where-Object { Test-Path -LiteralPath $_ }
)
if ($existingFiles.Count -gt 0 -and -not $Force) {
    $names = ($existingFiles | ForEach-Object { Split-Path -Leaf $_ }) -join ', '
    throw "既存のsecretがあります: $names。全件を意図的に再生成する場合だけ -Force を指定してください。"
}
if ($existingFiles.Count -gt 0) {
    Write-Warning '全secretを再生成します。既存の管理sessionと閲覧Cookieは無効になります。'
}

New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null
$stagingDirectory = Join-Path $secretDirectory ('.staging-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

try {
    # 途中で失敗して新旧secretが混在しないよう、全件を一時directoryへ生成してから移動する。
    New-PasswordHashFile `
        -Prompt '閲覧用password（16文字以上、管理用とは別）' `
        -OutputPath (Join-Path $stagingDirectory 'viewer-password-hash.txt')
    New-PasswordHashFile `
        -Prompt '管理用password（16文字以上、閲覧用とは別）' `
        -OutputPath (Join-Path $stagingDirectory 'admin-password-hash.txt')

    $adminSigningKey = & node $signingKeyScript
    if ($LASTEXITCODE -ne 0) { throw '管理Cookie署名鍵の生成に失敗しました。' }
    [IO.File]::WriteAllText(
        (Join-Path $stagingDirectory 'admin-signing-key.txt'),
        $adminSigningKey.Trim(),
        $utf8WithoutBom
    )

    $privateKeyPath = Join-Path $stagingDirectory 'cloudfront-private.pem'
    $publicKeyPath = Join-Path $stagingDirectory 'cloudfront-public.pem'
    & openssl genrsa -out $privateKeyPath 2048
    if ($LASTEXITCODE -ne 0) { throw 'CloudFront秘密鍵の生成に失敗しました。' }
    & openssl rsa -pubout -in $privateKeyPath -out $publicKeyPath
    if ($LASTEXITCODE -ne 0) { throw 'CloudFront公開鍵の生成に失敗しました。' }

    foreach ($fileName in $secretFileNames) {
        Move-Item `
            -LiteralPath (Join-Path $stagingDirectory $fileName) `
            -Destination (Join-Path $secretDirectory $fileName) `
            -Force
    }
}
finally {
    # 本scriptが作った一時directoryだけを対象にし、失敗時の平文由来データを残さない。
    if (Test-Path -LiteralPath $stagingDirectory) {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
    }
}

Write-Host "秘密情報を $secretDirectory に生成しました。"
Write-Host 'このdirectoryはGitで無視されますが、CloudFront秘密鍵は別媒体にも安全にbackupしてください。'
Write-Host '再生成した場合は、公開鍵と4個のSSM値を必ず同じ作業で更新してください。'
