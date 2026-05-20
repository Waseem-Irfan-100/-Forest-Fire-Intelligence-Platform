# Serve the site from the project root so assets/ paths resolve correctly.
Set-Location $PSScriptRoot
Write-Host "Serving d:\Projects\transpo at http://localhost:8080/login.html"
python -m http.server 8080
