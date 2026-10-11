# SafeRoute.AI — Android Mobile Application

This directory contains the complete, production-ready native Android project for **SafeRoute.AI (Night Travel Guardian)**.

---

## 📱 Features in Android Build

- **Native Geolocation Permissions**: Seamless GPS tracking with runtime permission requests.
- **Full Offline AI Risk Engine**: Evaluates lighting density, safe havens, and crime zones locally without requiring external cloud connectivity.
- **Hardware-Accelerated Dark Theme UI**: Built with a sleek nocturnal dark palette (Slate-950 status & navigation bar matching).
- **Emergency SOS & Phone Integration**: Instant triggering of emergency dialer (`tel:`) and emergency SMS (`sms:`) for trusted contacts.
- **Pre-packaged Release APK**: Ready-to-install signed APK at the project root: `SafeRoute-AI.apk`.

---

## 📦 Fast Build Using Automated Script (No Gradle Required)

The project includes an automated PowerShell build pipeline that leverages the installed Android SDK directly:

```powershell
powershell -ExecutionPolicy Bypass -File android/build_apk.ps1
```

This compiles resources with `aapt2`, compiles Java with `javac`, converts to DEX bytecode with `d8`, aligns with `zipalign`, and signs with `apksigner` using the included keystore.

The output will be placed at:
- `SafeRoute-AI.apk` (Project Root)
- `android/SafeRoute-AI.apk`
- `android/app/build/outputs/apk/release/SafeRoute-AI.apk`

---

## 🛠️ Building with Android Studio

1. Open Android Studio.
2. Select **Open an Existing Project** and choose the `android` folder.
3. Android Studio will automatically sync the Gradle files.
4. Select **Build > Build Bundle(s) / APK(s) > Build APK(s)** or click the **Run** button to launch on an emulator or physical device.

---

## 🔑 Keystore Information

- **Keystore File**: `android/keystore/saferoute.keystore`
- **Keystore Password**: `saferoute123`
- **Key Alias**: `saferoute`
- **Key Password**: `saferoute123`
