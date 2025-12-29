# CI/CD Pipeline Documentation

## Overview

This repository uses a comprehensive CI/CD pipeline that follows Agile best practices for fast feedback, quality gates, and automated deployments.

## Pipeline Architecture

```
Pull Request/Push
    ↓
Quality Checks (Fast Feedback <5min)
├── Frontend: Lint, Type Check, Tests, Security Audit
└── Backend: Lint, Type Check, Tests, Coverage, Security
    ↓
Build Requirements Detection
    ↓
Mobile Builds (Parallel)
├── iOS Build (EAS)
└── Android Build (EAS)
    ↓
Deployment Status
```

## Jobs Overview

### 1. Quality Checks - Frontend
**Purpose**: Fast feedback on code quality before expensive builds

**Runs**:
- ESLint for code quality
- TypeScript type checking
- Frontend tests (when available)
- npm audit for security vulnerabilities

**Cached**: npm dependencies for faster runs

### 2. Quality Checks - Backend
**Purpose**: Ensure Python backend quality and security

**Runs**:
- flake8 for Python linting
- black for code formatting check
- mypy for type checking
- bandit for security scanning
- pytest with coverage reporting

**Cached**: pip packages for faster runs

**Coverage**: Uploads test coverage as artifacts

### 3. Build Requirements Detection
**Purpose**: Smart build decisions based on trigger

**Logic**:
- Manual trigger: User selects platform/profile
- Main branch: Preview builds
- Develop branch: Development builds
- Version tags (`v*`): Production builds

### 4. Mobile Builds (iOS & Android)
**Purpose**: Build mobile apps via EAS

**Features**:
- Parallel builds for speed
- Profile-based builds (dev/preview/production)
- Artifact uploads for testing
- Gradle caching for Android

**Note**: Only runs after quality checks pass

### 5. Deployment Status
**Purpose**: Provide deployment guidance

**Shows**:
- Build completion status
- Manual submission commands for production
- Branch-specific messaging

## Triggers

### Automatic Triggers
- **Pull Request** to `main` or `develop`: Runs quality checks + builds
- **Push** to `main`: Quality checks + preview builds
- **Push** to `develop`: Quality checks + development builds
- **Tag** (`v*`): Quality checks + production builds

### Manual Trigger
- **workflow_dispatch**: Choose platform (iOS/Android/All) and profile (dev/preview/production)

## Environment-Based Behavior

| Branch/Tag | Profile | Auto-Build | Store Submit |
|------------|---------|------------|--------------|
| `develop` | development | ✅ Yes | ❌ No |
| `main` | preview | ✅ Yes | ❌ No |
| `v*` tags | production | ✅ Yes | ❌ Manual |
| Pull Request | preview | ✅ Yes | ❌ No |

## Quality Gates

All builds are blocked until these pass:
- ✅ Frontend linting (ESLint)
- ✅ TypeScript type checking
- ✅ Backend linting (flake8)
- ✅ Python tests (pytest)
- ⚠️ Security audits (warnings only)
- ⚠️ Code formatting (warnings only)

## Caching Strategy

For faster builds, the pipeline caches:
- **npm packages**: `~/.npm` and `node_modules`
- **pip packages**: `~/.cache/pip`
- **Gradle**: `~/.gradle/caches` and wrapper

Cache keys use lock file hashes to invalidate when dependencies change.

## Required Secrets

Configure these in GitHub repository settings:

| Secret | Purpose | Where to Get |
|--------|---------|--------------|
| `EXPO_TOKEN` | EAS builds | https://expo.dev/accounts/[account]/settings/access-tokens |

## Usage Examples

### Running Quality Checks Locally

**Frontend**:
```bash
npm run lint
npx tsc --noEmit
npm test
npm audit
```

**Backend**:
```bash
cd backend
flake8 app
black --check app tests
mypy app --ignore-missing-imports
bandit -r app -ll
pytest tests/ --cov=app
```

### Manual Build Trigger

1. Go to **Actions** tab
2. Select **CI/CD Pipeline**
3. Click **Run workflow**
4. Choose:
   - Platform: iOS/Android/All
   - Profile: development/preview/production

### Creating a Production Release

1. Create and push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Pipeline automatically builds production apps

3. Manually submit to stores:
   ```bash
   eas submit --platform ios --profile production
   eas submit --platform android --profile production
   ```

## Agile Best Practices Implemented

✅ **Fast Feedback**: Quality checks complete in <5 minutes
✅ **Quality Gates**: Builds blocked until tests pass
✅ **Automated Testing**: No manual intervention required
✅ **Parallel Execution**: Frontend and backend checks run simultaneously
✅ **Caching**: Dependencies cached for speed
✅ **Security Scanning**: Automated vulnerability checks
✅ **Code Coverage**: Track test coverage trends
✅ **Environment Isolation**: Separate dev/staging/prod builds

## Metrics to Track

The pipeline enables tracking of key Agile metrics:
- **Build Duration**: Time from commit to artifacts
- **Test Pass Rate**: Quality trends over time
- **Deployment Frequency**: How often code ships
- **Lead Time**: Commit to production time
- **Mean Time to Recovery**: Fix deployment time

## Future Enhancements

Consider adding:
- [ ] Code coverage threshold enforcement
- [ ] Automated changelog generation
- [ ] Slack/Discord notifications
- [ ] Performance testing (Lighthouse CI)
- [ ] E2E testing with Detox
- [ ] Automatic version bumping
- [ ] Status badges in README

## Troubleshooting

### Build Fails on Type Check
- Run `npx tsc --noEmit` locally to see errors
- Fix TypeScript errors before pushing

### Backend Tests Fail
- Run `pytest tests/` locally
- Ensure all dependencies are in `requirements.txt`

### EAS Build Fails
- Check EXPO_TOKEN secret is configured
- Verify `eas.json` profiles match workflow
- Check EAS build logs in Expo dashboard

### Cache Not Working
- Verify lock files (`package-lock.json`, `requirements.txt`) are committed
- Check cache size limits (10GB max)

## Support

For issues with:
- **Workflow**: Check this README and workflow file
- **EAS Builds**: See [EAS_SETUP.md](../../EAS_SETUP.md)
- **Backend**: See [backend/README.md](../../backend/README.md)

