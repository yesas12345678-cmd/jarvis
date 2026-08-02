[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Import-Module VirtualDesktop -Scope CurrentUser -ErrorAction SilentlyContinue

# Ensure Jarvis desktop exists
$jarvisDesktop = Get-DesktopList | Where-Object { $_.Name -eq 'Jarvis' }
if (-not $jarvisDesktop) {
    $jarvisDesktop = New-Desktop | Set-DesktopName -Name 'Jarvis'
}

# Find J.A.R.V.I.S. app window handle by title
$hwnd = (Get-Process | Where-Object { $_.MainWindowTitle -eq 'J.A.R.V.I.S. - Stark Industries OS' }).MainWindowHandle
if ($hwnd) {
    Move-Window -Hwnd $hwnd -Desktop $jarvisDesktop
    Write-Host "Successfully moved JARVIS window to Jarvis desktop."
} else {
    Write-Warning "JARVIS window not found."
}
