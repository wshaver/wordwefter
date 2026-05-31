# Deploy

Copy the example config and fill in the SSH target:

```powershell
Copy-Item .\deploy.config.example.ps1 .\deploy.config.ps1
notepad .\deploy.config.ps1
```

Deploy once:

```powershell
.\scripts\deploy.ps1
```

Auto-deploy when files in `public/` change:

```powershell
.\scripts\deploy.ps1 -Watch
```

The default config excludes `public/saved-games` so deploys do not overwrite server-side saved games.
