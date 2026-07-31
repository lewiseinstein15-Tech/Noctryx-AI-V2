==================== capacitor.config.json ====================
{
  "appId": "com.noctryx.ai",
  "appName": "Noctryx AI",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  },
  "plugins": {
    "SplashScreen": {
      "launchShowDuration": 2000,
      "backgroundColor": "#060a09"
    }
  }
}

==================== package.json ====================
{
  "name": "noctryx-ai",
  "version": "2.0.0",
  "description": "Noctryx AI V2 - Native App",
  "scripts": {
    "build": "mkdir -p dist && cp index.html dist/ && cp manifest.json dist/",
    "sync": "npx cap sync",
    "android": "npx cap open android",
    "build:android": "npm run build && npx cap sync android && cd android && ./gradlew assembleDebug"
  },
  "dependencies": {
    "@capacitor/android": "^6.0.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/splash-screen": "^6.0.0",
    "@capacitor/status-bar": "^6.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0"
  }
}

==================== .github/workflows/build.yml ====================
name: Build Android APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Install dependencies
        run: npm ci

      - name: Build web assets
        run: npm run build

      - name: Install Capacitor Android platform
        run: npx cap add android

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Build Debug APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: noctryx-ai-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk

      - name: Create Release
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ github.run_number }}
          name: Release v${{ github.run_number }}
          files: android/app/build/outputs/apk/debug/app-debug.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

==================== BUILD_GUIDE.md ====================
# Noctryx AI V2 — Build Real APK from Your Phone

## What You Need (All Free)
- A GitHub account (free)
- Your phone with GitHub app installed
- 10 minutes

## Step 1: Create a GitHub Repo (On Your Phone)

1. Open **GitHub app** or go to github.com in your browser
2. Tap **+** → **New repository**
3. Name it: `noctryx-ai`
4. Make it **Public**
5. Tap **Create repository**

## Step 2: Upload These Files

Upload ALL of these files to your repo root:
