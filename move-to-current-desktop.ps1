[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Import-Module VirtualDesktop -Scope CurrentUser -ErrorAction SilentlyContinue

# Get current desktop and move JARVIS window here
$currentDesktop = Get-CurrentDesktop
$hwnd = (Get-Process | Where-Object { $_.MainWindowTitle -eq 'J.A.R.V.I.S. - Stark Industries OS' }).MainWindowHandle
if ($hwnd) {
    Move-Window -Hwnd $hwnd -Desktop $currentDesktop
    
    # Activate and focus the window
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate('J.A.R.V.I.S. - Stark Industries OS')
    Write-Host "Successfully moved JARVIS window to current desktop."
} else {
    Write-Warning "JARVIS window not found."
}
