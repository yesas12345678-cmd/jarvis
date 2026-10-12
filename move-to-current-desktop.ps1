[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Import-Module VirtualDesktop -ErrorAction SilentlyContinue

# Get current desktop and move JARVIS window here
$currentDesktop = Get-CurrentDesktop
$proc = Get-Process | Where-Object { $_.MainWindowTitle -match 'Jude' -or $_.MainWindowTitle -match 'J\.A\.R\.V\.I\.S\.' } | Select-Object -First 1
$hwnd = if ($proc) { $proc.MainWindowHandle } else { $null }
if ($hwnd) {
    Move-Window -Hwnd $hwnd -Desktop $currentDesktop
    
    # Activate and focus the window
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate($proc.MainWindowTitle)
    Write-Host "Successfully moved Jude window to current desktop."
} else {
    Write-Warning "Jude window not found."
}
