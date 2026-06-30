param(
  [switch] $Watch,
  [int] $DebounceSeconds = 2,
  [string] $ConfigPath = "$PSScriptRoot\..\deploy.config.ps1"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$publicRoot = Join-Path $projectRoot "public"
$sourceRoot = Join-Path $projectRoot "src"

if (!(Test-Path $ConfigPath)) {
  throw "Missing deploy config: $ConfigPath. Copy deploy.config.example.ps1 to deploy.config.ps1 and fill in the remote SSH target."
}

. $ConfigPath

if (!$DeployUser -or !$DeployHost -or !$DeployPath) {
  throw "Deploy config must define `$DeployUser, `$DeployHost, and `$DeployPath."
}

if (!(Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh was not found on PATH."
}

if (!(Get-Command scp -ErrorAction SilentlyContinue)) {
  throw "scp was not found on PATH."
}

$exclude = @($DeployExclude + @("dist-test")) | Where-Object { $_ }
$sshTarget = "${DeployUser}@${DeployHost}"
$sshOptions = @()

if ($DeployIdentityFile) {
  $sshOptions += @("-i", $DeployIdentityFile)
}

function Convert-ToRemotePath {
  param([string] $RelativePath)

  $remoteRelative = $RelativePath -replace "\\", "/"
  return "$DeployPath/$remoteRelative"
}

function Test-IsExcluded {
  param([string] $RelativePath)

  foreach ($pattern in $exclude) {
    $normalizedPattern = $pattern.Trim("/\")
    if ($RelativePath -eq $normalizedPattern -or $RelativePath.StartsWith("$normalizedPattern\")) {
      return $true
    }
  }

  return $false
}

function Get-DeployRelativePath {
  param([string] $Path)

  $root = $publicRoot.TrimEnd("\") + "\"
  $resolvedPath = (Resolve-Path $Path).Path

  if ($resolvedPath -eq $publicRoot) {
    return "."
  }

  return $resolvedPath.Substring($root.Length)
}

function Invoke-NativeCommand {
  param(
    [string] $Command,
    [string[]] $Arguments
  )

  & $Command @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

function Invoke-Deploy {
  Push-Location $projectRoot
  try {
    Invoke-NativeCommand "npm.cmd" -Arguments @("run", "build")
  } finally {
    Pop-Location
  }

  $files = Get-ChildItem -Path $publicRoot -Recurse -File | Where-Object {
    $relative = Get-DeployRelativePath $_.FullName
    !(Test-IsExcluded $relative)
  }

  if ($files.Count -eq 0) {
    Write-Host "No files to deploy."
    return
  }

  Write-Host "Deploying $($files.Count) files to ${sshTarget}:${DeployPath}"

  $directories = $files | ForEach-Object {
    $relative = Get-DeployRelativePath $_.DirectoryName
    if ($relative -eq ".") { "" } else { Convert-ToRemotePath $relative }
  } | Sort-Object -Unique

  $quotedDirectories = $directories | ForEach-Object { "'$($_ -replace "'", "'\''")'" }
  $mkdirCommand = "mkdir -p '$($DeployPath -replace "'", "'\''")' $($quotedDirectories -join ' ')"
  Invoke-NativeCommand "ssh" -Arguments ($sshOptions + @($sshTarget, $mkdirCommand))

  foreach ($file in $files) {
    $relative = Get-DeployRelativePath $file.FullName
    $remotePath = Convert-ToRemotePath $relative

    Write-Host "-> $relative"
    Invoke-NativeCommand "scp" -Arguments ($sshOptions + @($file.FullName, "${sshTarget}:$remotePath"))
  }

  Write-Host "Deploy complete."
}

if (!$Watch) {
  Invoke-Deploy
  exit 0
}

Write-Host "Watching $publicRoot for changes. Press Ctrl+C to stop."
Invoke-Deploy

$pending = $false
$lastChange = Get-Date
$watchers = @(
  [System.IO.FileSystemWatcher]::new($publicRoot),
  [System.IO.FileSystemWatcher]::new($sourceRoot)
)

$action = {
  $fullPath = $Event.SourceEventArgs.FullPath

  if ($fullPath -and $fullPath.StartsWith((Join-Path $publicRoot "dist"))) {
    return
  }

  $script:pending = $true
  $script:lastChange = Get-Date
}

$subscriptions = @(
  $watchers | ForEach-Object {
    $_.IncludeSubdirectories = $true
    $_.EnableRaisingEvents = $true
    Register-ObjectEvent $_ Changed -Action $action
    Register-ObjectEvent $_ Created -Action $action
    Register-ObjectEvent $_ Deleted -Action $action
    Register-ObjectEvent $_ Renamed -Action $action
  }
)

try {
  while ($true) {
    Start-Sleep -Milliseconds 250

    if ($pending -and ((Get-Date) - $lastChange).TotalSeconds -ge $DebounceSeconds) {
      $pending = $false
      Invoke-Deploy
    }
  }
} finally {
  $subscriptions | ForEach-Object {
    Unregister-Event -SubscriptionId $_.Id
    Remove-Job -Id $_.Id -Force
  }
  $watchers | ForEach-Object { $_.Dispose() }
}
