Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path $PSScriptRoot "src-tauri\icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null
}

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Gradient background
$rect = New-Object System.Drawing.Rectangle 0, 0, 256, 256
$color1 = [System.Drawing.Color]::FromArgb(79, 70, 229)
$color2 = [System.Drawing.Color]::FromArgb(147, 51, 234)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $color1, $color2, 45.0
$g.FillRectangle($brush, $rect)

# Draw Logo Letter 'M'
$font = New-Object System.Drawing.Font "Arial", 110, [System.Drawing.FontStyle]::Bold
$strBrush = [System.Drawing.Brushes]::White
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("M", $font, $strBrush, (New-Object System.Drawing.RectangleF 0, 0, 256, 256), $format)

$g.Dispose()

# Save PNGs
$bmp.Save((Join-Path $iconsDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $iconsDir "128x128.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $iconsDir "128x128@2x.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $iconsDir "icon.icns"), [System.Drawing.Imaging.ImageFormat]::Png)

$bmp32 = New-Object System.Drawing.Bitmap $bmp, 32, 32
$bmp32.Save((Join-Path $iconsDir "32x32.png"), [System.Drawing.Imaging.ImageFormat]::Png)

# Save ICO
$hIcon = $bmp.GetHicon()
$ico = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream (Join-Path $iconsDir "icon.ico"), [System.IO.FileMode]::Create
$ico.Save($fs)
$fs.Close()

Write-Host "Icons generated successfully in $iconsDir"
