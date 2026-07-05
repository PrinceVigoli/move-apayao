Get-Content "$PSScriptRoot\artifacts\api-server\.env.local" | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $name, $value = $_ -split '=', 2
    Set-Item -Path "Env:$name" -Value $value
}
Write-Host "Environment loaded from .env.local" -ForegroundColor Green