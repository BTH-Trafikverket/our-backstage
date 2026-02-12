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
Write-Host "Waiting for run $runId..."
gh run watch $runId -R $Repo --exit-status | Out-Null

$tmp = New-Item -ItemType Directory -Force -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString()))
try {
  Write-Host "Downloading artifact..."
  gh run download $runId -R $Repo -n $Artifact -D $tmp.FullName | Out-Null

  $projectRoot = (git rev-parse --show-toplevel).Trim()
  $secretsDir = Join-Path $projectRoot ".secrets"
  New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null

  Copy-Item (Join-Path $tmp.FullName ".env.local") (Join-Path $projectRoot ".env.local") -Force
  Copy-Item (Join-Path $tmp.FullName "app.pem") (Join-Path $secretsDir "app.pem") -Force

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
