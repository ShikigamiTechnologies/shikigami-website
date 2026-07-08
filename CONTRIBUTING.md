# Shikigami Website — Deployment Workflow

## Three-Node Pipeline

Ricardo → Claude → GitHub → Cloudflare Pages → shikigamitechnologies.com

## Branch Structure

| Branch | Purpose | Auto-deploys to |
|--------|---------|-----------------|
| main   | Production | shikigamitechnologies.com |
| dev    | Staging/preview | [branch].shikigami-website.pages.dev |

## How to Update the Site

### Quick fix (typo, text change):
```powershell
git checkout dev
# make your changes
git add .
git commit -m "fix: description of change"
git push origin dev
# review preview URL in Cloudflare Pages dashboard
git checkout main
git merge dev
git push origin main
# live in 60 seconds
```

### New page or big change:
1. Work with Claude in VS Code session
2. Claude writes updated code
3. Save files, push to dev branch
4. Review Cloudflare preview URL
5. Merge dev → main when approved

### GitHub Secrets Required:
- CLOUDFLARE_API_TOKEN — from Cloudflare → My Profile → API Tokens
- CLOUDFLARE_ACCOUNT_ID — from Cloudflare dashboard right sidebar

Add at: github.com/ShikigamiTechnologies/shikigami-website → Settings → Secrets → Actions

## Hermes Monitoring
- Uptime check every 5 minutes via cron
- Telegram alert on any downtime
- Weekly analytics report on Sundays
