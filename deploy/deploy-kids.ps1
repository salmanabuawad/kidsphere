# Deploy the committed HEAD to https://kids.kortexd.com from Windows PowerShell.
# Runs deploy/remote-deploy.sh through Git Bash with this server's names.
#
#   powershell -ExecutionPolicy Bypass -File C:\projects\kidsphere\deploy\deploy-kids.ps1
$ErrorActionPreference = "Stop"
$bash = "C:\Program Files\Git\bin\bash.exe"
if (-not (Test-Path $bash)) { throw "Git Bash not found at $bash" }

$cmd = @'
cd /c/projects/kidsphere && \
SSH_HOST=185.229.226.37 APP_DIR=/opt/kidsphere-app APP_USER=kidsphere-app SERVICE=kidsphere-app \
DB_NAME=kidsphere_app DB_USER=kidsphere_app PORT=3070 STORAGE_DIR=/var/lib/kidsphere-app/storage \
DOMAIN=kids.kortexd.com bash deploy/remote-deploy.sh
'@
& $bash -lc $cmd
exit $LASTEXITCODE
