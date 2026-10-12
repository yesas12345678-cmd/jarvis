[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Import-Module VirtualDesktop -ErrorAction SilentlyContinue

# Get current desktop and move Jude window here
$currentDesktop = Get-CurrentDesktop
$proc = $null

for ($i = 0; $i -lt 12; $i++) {
    $proc = Get-Process | Where-Object { 
        $_.MainWindowTitle -match 'Jude' -or 
        $_.MainWindowTitle -match 'localhost:3001' -or 
        $_.MainWindowTitle -match 'Sistema Hologr' -or 
        $_.MainWindowTitle -match 'J\.A\.R\.V\.I\.S\.' 
    } | Select-Object -First 1

    if ($proc -and $proc.MainWindowHandle -ne 0) {
        break
    }
    Start-Sleep -Milliseconds 800
}

$hwnd = if ($proc) { $proc.MainWindowHandle } else { $null }
if ($hwnd) {
    Move-Window -Hwnd $hwnd -Desktop $currentDesktop -ErrorAction SilentlyContinue
    
    # Activate and focus the window
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate($proc.Id)
    Write-Host "Successfully moved Jude window to current desktop."
} else {
    Write-Warning "Jude window not found."
}
