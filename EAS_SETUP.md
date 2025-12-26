# EAS CI/CD Setup Guide

This guide will help you complete the setup of your Expo EAS (Expo Application Services) CI/CD pipeline.

## Prerequisites

1. **Expo Account**: Make sure you have an Expo account and are logged in
2. **EAS CLI**: Already installed as a dev dependency (`eas-cli`)
3. **GitHub Repository**: Your code should be in a GitHub repository

## Initial Setup Steps

### 1. Login to Expo

```bash
npx eas login
```

### 2. Configure Your Expo Project

```bash
npx eas build:configure
```

This will verify your `eas.json` configuration and ensure your project is properly set up.

### 3. Set Up Environment Variables

You'll need to configure environment variables for different build profiles. Based on your `config/env.ts`, you need:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_ENVIRONMENT`
- `EXPO_PUBLIC_ENABLE_ANALYTICS` (optional)
- `EXPO_PUBLIC_ENABLE_ADS` (optional)

#### For EAS Build:

You can set environment variables in `eas.json` (already configured per profile) or use EAS Secrets:

```bash
# Set secrets for production builds
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value your-value
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value your-value
npx eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value your-value
```

### 4. GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add the following secret:
   - `EXPO_TOKEN`: Your Expo access token

   To get your Expo token:
   ```bash
   npx eas whoami
   npx eas build:configure
   ```
   
   Or create one at: https://expo.dev/accounts/[your-account]/settings/access-tokens

### 5. iOS Setup (if building for iOS)

#### Apple Developer Account

1. Update `eas.json` with your Apple credentials:
   ```json
   "ios": {
     "appleId": "your-apple-id@example.com",
     "ascAppId": "your-app-store-connect-app-id",
     "appleTeamId": "your-apple-team-id"
   }
   ```

2. For automatic submissions, you may need to set up App Store Connect API key or App-Specific Password.

### 6. Android Setup (if building for Android)

#### Google Play Service Account

1. Create a Google Service Account in Google Cloud Console
2. Grant it access to your Google Play Console
3. Download the JSON key file
4. Upload it to EAS or store it securely:
   ```bash
   npx eas secret:create --scope project --name GOOGLE_SERVICE_ACCOUNT_KEY --type file --value path/to/google-service-account.json
   ```

5. Update `eas.json` submit configuration with the path if using a file:
   ```json
   "android": {
     "serviceAccountKeyPath": "./google-service-account.json",
     "track": "internal"
   }
   ```

## Build Profiles

The pipeline is configured with three build profiles:

### Development
- **When**: Manual builds, development testing
- **Platform**: iOS (simulator) and Android (APK)
- **Use Case**: Local testing with development client

### Preview
- **When**: Pull requests, feature branches, main branch
- **Platform**: iOS and Android (APK)
- **Use Case**: Internal testing, QA, stakeholder reviews

### Production
- **When**: Tags starting with `v*`, manual dispatch
- **Platform**: iOS and Android (AAB for Play Store, APK/IPA for App Store)
- **Use Case**: App Store submissions

## Workflow Triggers

The GitHub Actions workflow triggers on:

1. **Push to `main` or `develop`**: Builds preview profile
2. **Pull Requests**: Builds preview profile
3. **Tags `v*`**: Builds production profile and submits to stores
4. **Manual Dispatch**: Choose platform and profile via GitHub Actions UI

## Usage

### Local Builds

```bash
# Development build
npm run eas:build:dev

# Preview build
npm run eas:build:preview

# Production build
npm run eas:build:prod

# Platform-specific builds
npm run eas:build:android
npm run eas:build:ios
npm run eas:build:all
```

### CI/CD Builds

Builds are automatically triggered on:
- Push to main/develop branches → Preview builds
- Creating a tag (e.g., `v1.0.0`) → Production builds with auto-submit

### Manual Workflow Dispatch

1. Go to **Actions** tab in GitHub
2. Select **EAS Build** workflow
3. Click **Run workflow**
4. Choose platform and profile
5. Click **Run workflow**

### Submitting to Stores

Production builds from tags are automatically submitted. You can also manually submit:

```bash
npm run eas:submit
```

## Testing the Setup

1. Make a small change and push to `develop` branch
2. Check GitHub Actions to see the build workflow run
3. Monitor the build status in Expo dashboard: https://expo.dev/accounts/[your-account]/projects/smart-pantry/builds

## Troubleshooting

### Build Fails

1. Check build logs in GitHub Actions
2. Verify environment variables are set correctly
3. Check Expo dashboard for detailed build logs
4. Ensure all dependencies are compatible

### Submission Fails

1. Verify iOS/Android credentials are correct in `eas.json`
2. Check App Store Connect / Google Play Console access
3. Ensure your app is properly configured in store consoles

### Environment Variables Not Found

1. Set them as EAS secrets: `npx eas secret:create`
2. Or configure them in `eas.json` under the `env` section per profile

## Additional Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [GitHub Actions with EAS](https://docs.expo.dev/build/building-on-ci/)
- [Environment Variables](https://docs.expo.dev/build-reference/variables/)

## Next Steps

1. ✅ Complete the setup steps above
2. ✅ Configure your environment variables
3. ✅ Set up GitHub secrets
4. ✅ Configure iOS/Android credentials (if applicable)
5. ✅ Test with a preview build
6. ✅ Create your first production release

