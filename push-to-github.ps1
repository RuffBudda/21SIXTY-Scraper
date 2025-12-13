# PowerShell script to push to GitHub
# This will prompt for your GitHub username and help you set up the remote

Write-Host "=== 21 SIXTY Scrapper - GitHub Push Helper ===" -ForegroundColor Cyan
Write-Host ""

# Get GitHub username
$githubUsername = Read-Host "Enter your GitHub username"

if ([string]::IsNullOrWhiteSpace($githubUsername)) {
    Write-Host "Username cannot be empty. Exiting." -ForegroundColor Red
    exit 1
}

$repoName = "21-sixty-scrapper"
$remoteUrl = "https://github.com/$githubUsername/$repoName.git"

Write-Host ""
Write-Host "Repository will be: $remoteUrl" -ForegroundColor Yellow
Write-Host ""

# Check if remote already exists
$existingRemote = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Remote 'origin' already exists: $existingRemote" -ForegroundColor Yellow
    $replace = Read-Host "Do you want to replace it? (y/n)"
    if ($replace -eq "y" -or $replace -eq "Y") {
        git remote remove origin
    } else {
        Write-Host "Keeping existing remote. Exiting." -ForegroundColor Yellow
        exit 0
    }
}

# Add remote
Write-Host "Adding remote origin..." -ForegroundColor Green
git remote add origin $remoteUrl

if ($LASTEXITCODE -eq 0) {
    Write-Host "Remote added successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Create the repository '$repoName' on GitHub:" -ForegroundColor White
    Write-Host "   https://github.com/new" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Make sure the repository name is: $repoName" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Once created, run this command to push:" -ForegroundColor White
    Write-Host "   git push -u origin main" -ForegroundColor Green
    Write-Host ""
    Write-Host "If you need to authenticate, GitHub will prompt you." -ForegroundColor Yellow
} else {
    Write-Host "Failed to add remote. Please check your Git configuration." -ForegroundColor Red
}

