$ErrorActionPreference = 'Stop'

Set-Item -Path env:JAVA_HOME -Value "$HOME\jdk-17"
Set-Item -Path env:ANDROID_HOME -Value "$HOME\AppData\Local\Android\Sdk"

Write-Host "JAVA_HOME: $env:JAVA_HOME"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"

Set-Location "$PSScriptRoot\android"

Write-Host "Starting Gradle assembleDebug..."
cmd.exe /c "gradlew.bat assembleDebug --stacktrace"
