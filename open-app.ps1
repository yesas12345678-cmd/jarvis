param(
    [string]$AppName
)

if (-not $AppName) {
    Write-Error "AppName parameter is required."
    exit 1
}

# Clean and split the query into search keywords
$keywords = $AppName.ToLower().Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { $_.Length -gt 1 }
if ($keywords.Count -eq 0) {
    $keywords = @($AppName.ToLower())
}

# Directories to search for shortcuts (.lnk) and executables (.exe)
$searchPaths = @(
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
    "$env:AppData\Microsoft\Windows\Start Menu\Programs",
    "$env:LocalAppData\Programs",
    "$env:LocalAppData",
    "$env:AppData"
)

Write-Host "Searching for app matching: $AppName..."

$bestMatch = $null
$bestScore = 0

foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        # Get all .lnk and .exe files
        $files = Get-ChildItem -Path $path -Recurse -File -Include *.lnk, *.exe -ErrorAction SilentlyContinue
        
        foreach ($file in $files) {
            $name = $file.BaseName.ToLower()
            $score = 0
            
            # Count how many keywords match the file name
            foreach ($kw in $keywords) {
                if ($name -like "*$kw*") {
                    $score += 2
                }
            }
            
            # Extra points for exact or very close matching
            if ($name -eq $AppName.ToLower()) {
                $score += 5
            }
            
            # Fuzzy match: if "sky" is searched but name contains "sk" (or vice versa), count as match
            if (($AppName.ToLower() -like "*sky*" -and $name -like "*sk*") -or ($AppName.ToLower() -like "*sk*" -and $name -like "*sky*")) {
                $score += 2
            }

            if ($score -gt $bestScore) {
                $bestScore = $score
                $bestMatch = $file.FullName
            }
        }
    }
}

if ($bestMatch -and $bestScore -gt 1) {
    Write-Host "Found best match: $bestMatch (Score: $bestScore)"
    # Run the shortcut or executable
    Start-Process -FilePath $bestMatch -ErrorAction SilentlyContinue
    exit 0
} else {
    # Last fallback: try executing directly
    Write-Host "No start menu match found. Falling back to native start command..."
    Start-Process -FilePath $AppName -ErrorAction SilentlyContinue
}
