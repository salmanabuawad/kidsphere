# Deploy the committed HEAD to kids.kortexd.com from PowerShell.
#   powershell -ExecutionPolicy Bypass -File C:\projects\kidsphere\deploy\deploy-kids.ps1 [-Install]
# Wraps deploy/remote-deploy.sh with Git Bash.
param([switch]$Install)
$bash = Join-Path ${env:ProgramFiles} 'Git\bin\bash.exe'
$repo = Split-Path -Parent $PSScriptRoot
$args = @("$repo/deploy/remote-deploy.sh")
if ($Install) { $args += '--install' }
Push-Location $repo
try { & $bash @args; exit $LASTEXITCODE } finally { Pop-Location }
