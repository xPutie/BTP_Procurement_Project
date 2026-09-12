$ErrorActionPreference = "Stop"

function Assert-ExitCode {
    param(
        [string]$StepName
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$StepName failed with exit code $LASTEXITCODE"
    }
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$mtarName = "po_automation_ui_0.0.26.mtar"
$mtarPath = Join-Path "mta_archives" $mtarName

$cfExe = "C:\Users\Admin\cf-cli\unzipped\cf.exe"
if (-not (Test-Path $cfExe)) {
    $cfExe = "cf"
}

Write-Host "==> Cleaning build artifacts"
$pathsToClean = @(
    "gen",
    "app/procurement/dist",
    $mtarPath
)

foreach ($target in $pathsToClean) {
    if (Test-Path $target) {
        Remove-Item $target -Recurse -Force
    }
}

Write-Host "==> Installing dependencies"
npm ci
Assert-ExitCode "npm ci"

Write-Host "==> Building CAP production artifacts"
npx cds build --production
Assert-ExitCode "cds build"

Write-Host "==> Building procurement UI"
npm run --prefix app/procurement build
Assert-ExitCode "UI build"

Write-Host "==> Building MTAR archive"
npx mbt build -t mta_archives --mtar $mtarName
Assert-ExitCode "MBT build"

Write-Host "==> Checking Cloud Foundry authentication"
& $cfExe oauth-token *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Cloud Foundry session expired. Run '$cfExe login -a https://api.cf.us10-001.hana.ondemand.com -u <your-email> -o <your-org> -s <your-space>' and then rerun this script."
}

Write-Host "==> Deploying MTAR to Cloud Foundry"
& $cfExe deploy $mtarPath -e "mta.lowmem.mtaext" -f
Assert-ExitCode "cf deploy"

Write-Host "==> Done: clean build and deploy completed"
