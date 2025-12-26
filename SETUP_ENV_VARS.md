# Environment Variables Setup Guide

## Step 1: Set EAS Secrets (for builds)

You need to set these environment variables as EAS secrets. Run these commands one by one, replacing the placeholder values with your actual values:

```bash
# Required: Supabase URL
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"

# Required: Supabase Anon Key
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-supabase-anon-key-here"

# Optional: API URL (if different from default)
npx eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://your-api-url.com/api/v1"

# Optional: Enable Analytics (set to "true" or "false")
npx eas secret:create --scope project --name EXPO_PUBLIC_ENABLE_ANALYTICS --value "false"

# Optional: Enable Ads (set to "true" or "false")
npx eas secret:create --scope project --name EXPO_PUBLIC_ENABLE_ADS --value "false"
```

**Note:** The `EXPO_PUBLIC_ENVIRONMENT` variable is already configured in `eas.json` per build profile (development/staging/production), so you don't need to set it as a secret.

## Step 2: Set GitHub Secret (for CI/CD)

The token you provided is for GitHub Actions. Here's how to add it:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `EXPO_TOKEN`
5. Value: `np84eI8RKuoKqf_ziu6Kpe7TP1nxDh-FsESHhQy4`
6. Click **Add secret**

Alternatively, you can use the GitHub CLI if you have it installed:
```bash
gh secret set EXPO_TOKEN --body "np84eI8RKuoKqf_ziu6Kpe7TP1nxDh-FsESHhQy4"
```

## Alternative: Using eas.json for Environment Variables

Instead of EAS secrets, you can also add environment variables directly to `eas.json` in each build profile's `env` section. However, secrets are more secure for sensitive values like API keys.

For non-sensitive values, you can add them to `eas.json` like this (they're already there for EXPO_PUBLIC_ENVIRONMENT):

```json
"env": {
  "EXPO_PUBLIC_ENVIRONMENT": "production",
  "EXPO_PUBLIC_API_URL": "https://api.example.com",
  "EXPO_PUBLIC_ENABLE_ANALYTICS": "false"
}
```

But for sensitive values (like Supabase keys), use EAS secrets as shown above.

