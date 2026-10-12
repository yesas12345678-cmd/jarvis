[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Import-Module VirtualDesktop -ErrorAction SilentlyContinue

# Ensure Jarvis desktop exists
$jarvisDesktop = Get-DesktopList | Where-Object { $_.Name -eq 'Jarvis' }
if (-not $jarvisDesktop) {
    $jarvisDesktop = New-Desktop | Set-DesktopName -Name 'Jarvis'
}

# Find Jude / J.A.R.V.I.S. app window handle by title
$proc = Get-Process | Where-Object { $_.MainWindowTitle -match 'Jude' -or $_.MainWindowTitle -match 'J\.A\.R\.V\.I\.S\.' } | Select-Object -First 1
$hwnd = if ($proc) { $proc.MainWindowHandle } else { $null }
if ($hwnd) {
    Move-Window -Hwnd $hwnd -Desktop $jarvisDesktop
    Write-Host "Successfully moved Jude window to Jarvis desktop."
} else {
    Write-Warning "Jude window not found."
}
