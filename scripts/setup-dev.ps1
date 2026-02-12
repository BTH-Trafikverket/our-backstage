$ErrorActionPreference = "Stop"

$Repo = "BTH-Trafikverket/our-backstage"
$Workflow = "dev-secrets-bundle.yml"
$Artifact = "dev-secrets-bundle"

function Require-Cmd($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $cmd"
  }
}

Require-Cmd gh
Require-Cmd git

# Ensure authenticated
try { gh auth status | Out-Null } catch {
  Write-Host "Logging in to GitHub CLI..."
  gh auth login | Out-Null
}

Write-Host "Triggering workflow (may require environment approval)..."
gh workflow run $Workflow -R $Repo | Out-Null

Start-Sleep -Seconds 2

$runId = gh run list -R $Repo --workflow $Workflow --limit 1 --json databaseId -q ".[0].databaseId"
if (-not $runId) { throw "Could not find latest workflow run for $Workflow" }

Write-Host "Waiting for run $runId..."
gh run watch $runId -R $Repo --exit-status | Out-Null

$tmp = New-Item -ItemType Directory -Force -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString()))
try {
  Write-Host "Downloading artifact..."
  gh run download $runId -R $Repo -n $Artifact -D $tmp.FullName | Out-Null

  # Find files even if gh created a subfolder
  $envFile = Get-ChildItem -Path $tmp.FullName -Recurse -Force -File -Filter ".env.local" | Select-Object -First 1
  $pemFile = Get-ChildItem -Path $tmp.FullName -Recurse -Force -File -Filter "app.pem" | Select-Object -First 1

  if (-not $envFile) {
    Write-Host "ERROR: .env.local not found in downloaded artifact."
    Write-Host "Downloaded files:"
    Get-ChildItem -Path $tmp.FullName -Recurse -Force -File | ForEach-Object { $_.FullName }
    throw ".env.local missing"
  }

  if (-not $pemFile) {
    Write-Host "ERROR: app.pem not found in downloaded artifact."
    Write-Host "Downloaded files:"
    Get-ChildItem -Path $tmp.FullName -Recurse -Force -File | ForEach-Object { $_.FullName }
    throw "app.pem missing"
  }

  $projectRoot = (git rev-parse --show-toplevel).Trim()
  if (-not $projectRoot) { throw "Could not determine git project root (are you inside the repo?)" }

  $secretsDir = Join-Path $projectRoot ".secrets"
  New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null

  Copy-Item $envFile.FullName (Join-Path $projectRoot ".env.local") -Force
  Copy-Item $pemFile.FullName (Join-Path $secretsDir "app.pem") -Force

  Write-Host ""
  Write-Host "✅ Installed:"
  Write-Host "  - $(Join-Path $projectRoot '.env.local')"
  Write-Host "  - $(Join-Path $secretsDir 'app.pem')"
  Write-Host ""
  Write-Host "Next: load .env.local (envx/dotenv) and run Backstage."
}
finally {
  Remove-Item -Recurse -Force $tmp.FullName
}
