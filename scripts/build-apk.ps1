# Builds an installable Android APK and puts it on the Desktop.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
#
# Needs JDK 17 and the Android SDK (see README "APK derleme"). The project folder name
# contains non-ASCII characters and Windows limits paths to 260 chars, both of which
# break Gradle/CMake builds, so the project is mirrored to a short ASCII folder first.
# The generated android/ folder lives only there (Continuous Native Generation).
param(
  [string]$BuildDir = 'C:\gp\app',
  # arm64-v8a covers practically every phone from the last ~8 years; add
  # ",armeabi-v7a" for very old 32-bit devices (longer build, bigger APK).
  [string]$Architectures = 'arm64-v8a',
  [string]$CmakeVersion = '3.31.6',
  [string]$OutFile = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'GunPlanlayici.apk')
)
$ErrorActionPreference = 'Stop'
$src = Split-Path $PSScriptRoot -Parent

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $env:LOCALAPPDATA 'Programs\jdk17' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { throw "JDK 17 bulunamadı: $env:JAVA_HOME" }
if (-not (Test-Path $env:ANDROID_HOME)) { throw "Android SDK bulunamadı: $env:ANDROID_HOME" }
$longPaths = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
if ($longPaths -ne 1) { throw 'Windows uzun yol desteği kapalı (LongPathsEnabled). README "APK derleme" bölümüne bakın.' }

Write-Output "1/4 Proje $BuildDir klasörüne eşitleniyor..."
New-Item -ItemType Directory -Force $BuildDir | Out-Null
# Exclude by full path: a bare name like "android" would also skip node_modules\*\android.
$exclude = foreach ($d in '.git', '.expo', 'android', 'dist') { Join-Path $src $d; Join-Path $BuildDir $d }
robocopy $src $BuildDir /MIR /XD @exclude /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy başarısız ($LASTEXITCODE)" }

Write-Output '2/4 Android projesi üretiliyor (expo prebuild)...'
Push-Location $BuildDir
try {
  # A stale android/ (old autolinking list, CMake cache) breaks the build after
  # dependency or config changes, so regenerate it from scratch when they change.
  $inputs = 'package.json', 'package-lock.json', 'app.json', 'react-native.config.js' | Where-Object { Test-Path $_ }
  $hash = (Get-FileHash -Algorithm SHA256 -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes((($inputs | ForEach-Object { (Get-FileHash $_).Hash }) -join '|'))))).Hash
  $hashFile = 'android\.prebuild-inputs'
  if ((Test-Path 'android') -and (-not (Test-Path $hashFile) -or (Get-Content $hashFile) -ne $hash)) {
    Write-Output '   Bağımlılıklar/yapılandırma değişmiş, android/ temizleniyor...'
    # rd with the \\?\ prefix: Remove-Item in PS 5.1 cannot delete >260-char CMake paths.
    cmd /c "rd /s /q `"\\?\$BuildDir\android`""
    if (Test-Path 'android') { throw 'android/ silinemedi' }
  }
  $env:CI = '1'
  npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'expo prebuild başarısız' }
  # CMake 3.31+ ships Ninja 1.12, which handles >260-char paths once Windows'
  # LongPathsEnabled is on. The default 3.22.1 (Ninja 1.10) fails on React Native codegen.
  $cmakeDir = Join-Path $env:ANDROID_HOME "cmake\$CmakeVersion"
  if (-not (Test-Path "$cmakeDir\bin\ninja.exe")) { throw "CMake $CmakeVersion yok: sdkmanager `"cmake;$CmakeVersion`"" }
  @(
    "sdk.dir=$($env:ANDROID_HOME -replace '\\', '\\')"
    "cmake.dir=$($cmakeDir -replace '\\', '\\')"
  ) | Set-Content -Encoding ascii android\local.properties
  $hash | Set-Content -Encoding ascii $hashFile

  Write-Output "3/4 APK derleniyor ($Architectures)... İlk derleme 20-40 dakika sürebilir."
  Push-Location android
  try {
    .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$Architectures" --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Gradle derlemesi başarısız' }
  } finally { Pop-Location }

  $apk = Join-Path $BuildDir 'android\app\build\outputs\apk\release\app-release.apk'
  Write-Output "4/4 APK kopyalanıyor: $OutFile"
  Copy-Item $apk $OutFile -Force
  Get-Item $OutFile | Select-Object FullName, @{ n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }
} finally { Pop-Location }
