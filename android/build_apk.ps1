$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       SafeRoute.AI - Android APK Build Pipeline         " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Determine 8.3 short paths to prevent Unicode em-dash parsing issues with Android SDK C++ binaries on Windows
$fso = New-Object -ComObject Scripting.FileSystemObject
$CurrentScriptDir = $PSScriptRoot
$RootDir = (Get-Item "$CurrentScriptDir\..").FullName
$shortRoot = $fso.GetFolder($RootDir).ShortPath

$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk"
$BuildToolsDir = "$AndroidSdk\build-tools\35.0.0"
$PlatformJar = "$AndroidSdk\platforms\android-36\android.jar"
$shortPlatformJar = $fso.GetFile($PlatformJar).ShortPath

$Aapt2 = "$BuildToolsDir\aapt2.exe"
$D8 = "$BuildToolsDir\d8.bat"
$ZipAlign = "$BuildToolsDir\zipalign.exe"
$ApkSigner = "$BuildToolsDir\apksigner.bat"
$Jar = "C:\Program Files\Java\jdk-25.0.2\bin\jar.exe"
if (-not (Test-Path $Jar)) {
    $foundJar = Get-Command "jar" -ErrorAction SilentlyContinue
    if ($foundJar) { $Jar = $foundJar.Source }
}

if (-not (Test-Path $PlatformJar)) {
    throw "Android SDK platform jar not found at $PlatformJar"
}

$AndroidDir = "$shortRoot\android"
$BuildDir = "$AndroidDir\build"
$GenDir = "$BuildDir\gen"
$ClassesDir = "$BuildDir\classes"
$DexDir = "$BuildDir\dex"
$OutputsDir = "$AndroidDir\app\build\outputs\apk\release"

# 1. Synchronize Web Assets
Write-Host "[1/8] Syncing latest web application assets..." -ForegroundColor Yellow
$www = "$AndroidDir\app\src\main\assets\www"
if (Test-Path $www) { Remove-Item -Recurse -Force $www }
New-Item -ItemType Directory -Force -Path $www | Out-Null
Copy-Item "$shortRoot\index.html" "$www\index.html" -Force
Copy-Item "$shortRoot\css" "$www\" -Recurse -Force
Copy-Item "$shortRoot\js" "$www\" -Recurse -Force
Copy-Item "$shortRoot\assets" "$www\" -Recurse -Force
if (Test-Path "$shortRoot\manifest.json") { Copy-Item "$shortRoot\manifest.json" "$www\" -Force }
if (Test-Path "$shortRoot\sw.js") { Copy-Item "$shortRoot\sw.js" "$www\" -Force }
New-Item -ItemType Directory -Force -Path "$www\backend\ai_risk_engine" | Out-Null
Copy-Item "$shortRoot\backend\ai_risk_engine\*" "$www\backend\ai_risk_engine" -Recurse -Force
New-Item -ItemType Directory -Force -Path "$www\backend\data" | Out-Null
Copy-Item "$shortRoot\backend\data\*" "$www\backend\data" -Recurse -Force

# Clean __pycache__ from assets
Get-ChildItem -Path "$www" -Include "__pycache__","*.pyc" -Recurse -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 2. Prepare directories
Write-Host "[2/8] Initializing build directories..." -ForegroundColor Yellow
if (Test-Path $GenDir) { Remove-Item -Recurse -Force $GenDir }
if (Test-Path $ClassesDir) { Remove-Item -Recurse -Force $ClassesDir }
if (Test-Path $DexDir) { Remove-Item -Recurse -Force $DexDir }
New-Item -ItemType Directory -Force -Path $GenDir | Out-Null
New-Item -ItemType Directory -Force -Path $ClassesDir | Out-Null
New-Item -ItemType Directory -Force -Path $DexDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutputsDir | Out-Null

# 3. Compile Resources
Write-Host "[3/8] Compiling Android resources with AAPT2..." -ForegroundColor Yellow
$CompiledResZip = "$BuildDir\compiled_res.zip"
& $Aapt2 compile --dir "$AndroidDir\app\src\main\res" -o $CompiledResZip
if ($LASTEXITCODE -ne 0) { throw "AAPT2 compile failed" }

# 4. Link APK package and generate R.java
Write-Host "[4/8] Linking APK package and generating R.java..." -ForegroundColor Yellow
$LinkedApk = "$BuildDir\linked.apk"
if (Test-Path $LinkedApk) { Remove-Item -Force $LinkedApk }
& $Aapt2 link $CompiledResZip `
    -I $shortPlatformJar `
    --manifest "$AndroidDir\app\src\main\AndroidManifest.xml" `
    --java $GenDir `
    -o $LinkedApk
if ($LASTEXITCODE -ne 0) { throw "AAPT2 link failed" }

# 5. Compile Java sources
Write-Host "[5/8] Compiling Java classes with javac..." -ForegroundColor Yellow
$JavaSources = Get-ChildItem -Recurse -Path "$GenDir", "$AndroidDir\app\src\main\java" -Filter "*.java" | ForEach-Object { $_.FullName }
& javac --release 11 -cp $shortPlatformJar -d $ClassesDir $JavaSources
if ($LASTEXITCODE -ne 0) { throw "Javac compilation failed" }

# 6. Compile bytecode to Dalvik Executable (classes.dex)
Write-Host "[6/8] Converting bytecode to DEX with D8..." -ForegroundColor Yellow
$ClassFiles = Get-ChildItem -Recurse -Path $ClassesDir -Filter "*.class" | ForEach-Object { $_.FullName }
& $D8 --lib $shortPlatformJar --output $DexDir $ClassFiles
if ($LASTEXITCODE -ne 0) { throw "D8 compilation failed" }

# 7. Package classes.dex and web assets using standard JAR tool
Write-Host "[7/8] Packaging classes.dex and web assets into APK with clean standard entries..." -ForegroundColor Yellow
& $Jar -u -0 -f $LinkedApk -C $DexDir classes.dex
if ($LASTEXITCODE -ne 0) { throw "Failed to add classes.dex" }

& $Jar -u -f $LinkedApk -C "$AndroidDir\app\src\main" assets
if ($LASTEXITCODE -ne 0) { throw "Failed to add assets" }

# 8. ZipAlign & Sign APK
Write-Host "[8/8] Zipaligning and Signing APK with release keystore (v1 + v2 + v3 schemes)..." -ForegroundColor Yellow
$AlignedApk = "$BuildDir\aligned.apk"
if (Test-Path $AlignedApk) { Remove-Item -Force $AlignedApk }
& $ZipAlign -f -p 4 $LinkedApk $AlignedApk
if ($LASTEXITCODE -ne 0) { throw "Zipalign failed" }

$Keystore = "$AndroidDir\keystore\saferoute.keystore"
$FinalApkRoot = "$RootDir\SafeRoute-AI.apk"
$FinalApkOutputs = "$OutputsDir\SafeRoute-AI.apk"
$FinalApkAndroid = "$RootDir\android\SafeRoute-AI.apk"

if (Test-Path $FinalApkRoot) { Remove-Item -Force $FinalApkRoot }

& $ApkSigner sign `
    --ks $Keystore `
    --ks-pass "pass:saferoute123" `
    --key-pass "pass:saferoute123" `
    --ks-key-alias saferoute `
    --v1-signing-enabled true `
    --v2-signing-enabled true `
    --v3-signing-enabled true `
    --min-sdk-version 21 `
    --out $FinalApkRoot `
    $AlignedApk

if ($LASTEXITCODE -ne 0) { throw "Apksigner failed" }

Copy-Item $FinalApkRoot $FinalApkOutputs -Force
Copy-Item $FinalApkRoot $FinalApkAndroid -Force

Write-Host "--> Verifying APK signature..." -ForegroundColor Green
& $ApkSigner verify --verbose --min-sdk-version 21 $FinalApkRoot

$fileInfo = Get-Item $FinalApkRoot
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  SUCCESS! SafeRoute.AI APK Created & Signed Successfully! " -ForegroundColor Green
Write-Host "  Package:     ai.saferoute.app" -ForegroundColor Cyan
Write-Host "  Version:     1.0.0 (code 1)" -ForegroundColor Cyan
Write-Host "  File Path:   $($fileInfo.FullName)" -ForegroundColor Cyan
Write-Host "  File Size:   $([math]::Round($fileInfo.Length / 1MB, 2)) MB ($($fileInfo.Length) bytes)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
