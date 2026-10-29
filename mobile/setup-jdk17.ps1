$url = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse'
$destZip = "$HOME\Downloads\jdk17.zip"
$extractDir = "$HOME\jdk-17"

if (!(Test-Path "$extractDir\bin\javac.exe")) {
    Write-Host "Downloading OpenJDK 17 from $url ..."
    Invoke-WebRequest -Uri $url -OutFile $destZip -UseBasicParsing
    Write-Host "Extracting to $extractDir ..."
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    Expand-Archive -Path $destZip -DestinationPath "$HOME\jdk-temp" -Force
    $innerDir = (Get-ChildItem "$HOME\jdk-temp" | Select-Object -First 1).FullName
    Copy-Item -Path "$innerDir\*" -Destination $extractDir -Recurse -Force
    Remove-Item -Path "$HOME\jdk-temp" -Recurse -Force
    Remove-Item -Path $destZip -Force
}

Write-Host "JDK 17 Ready at: $extractDir"
& "$extractDir\bin\javac.exe" -version
