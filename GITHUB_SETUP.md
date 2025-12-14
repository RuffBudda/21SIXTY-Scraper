# GitHub Repository Setup Instructions

## Step 1: Create a New Repository on GitHub

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right corner
3. Select **"New repository"**
4. Fill in the repository details:
   - **Repository name**: `21-sixty-scrapper` (or your preferred name)
   - **Description**: "Multi-platform scraper for LinkedIn, Instagram, and websites with webhook API support"
   - **Visibility**: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click **"Create repository"**

## Step 2: Connect Local Repository to GitHub

After creating the repository, GitHub will show you commands. Use these commands in your terminal:

### Option A: If you haven't set up the remote yet

```bash
git remote add origin https://github.com/YOUR_USERNAME/21-sixty-scrapper.git
git branch -M main
git push -u origin main
```

### Option B: If you need to use SSH instead

```bash
git remote add origin git@github.com:YOUR_USERNAME/21-sixty-scrapper.git
git branch -M main
git push -u origin main
```

**Replace `YOUR_USERNAME` with your actual GitHub username!**

## Step 3: Verify Upload

1. Go to your repository page on GitHub
2. You should see all your files uploaded
3. The repository should show the commit message: "Initial commit: 21SIXTY SCRAPER..."

## Additional Notes

- Make sure you have Git configured with your name and email:
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "your.email@example.com"
  ```

- If you encounter authentication issues, you may need to:
  - Use a Personal Access Token instead of password
  - Set up SSH keys for GitHub
  - Use GitHub CLI (`gh auth login`)

## Files Included

The repository includes:
- ✅ All source code (app/, lib/, components/)
- ✅ Configuration files (package.json, tsconfig.json, etc.)
- ✅ README.md and SETUP_NOTES.md
- ✅ .gitignore (excludes node_modules, .env, etc.)
- ✅ Placeholder logo and favicon folders

## Files Excluded (by .gitignore)

- node_modules/
- .env files
- .next/ build directory
- .vercel/ deployment files

