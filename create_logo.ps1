Add-Type -AssemblyName System.Drawing
$width = 400
$height = 400
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::White)

# Background border circle or rounded rect
$rect = New-Object System.Drawing.Rectangle(20, 20, 360, 360)
$penNavy = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(0, 43, 102), 12)
$brushNavy = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 43, 102))
$brushOrange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 81, 0))
$brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$g.FillEllipse($brushNavy, $rect)

# Draw Orange inner decorative arc
$penOrange = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 81, 0), 10)
$g.DrawEllipse($penOrange, 40, 40, 320, 320)

# Text LP3I
$fontMain = New-Object System.Drawing.Font('Arial', 54, [System.Drawing.FontStyle]::Bold)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('LP3I', $fontMain, $brushWhite, 200, 160, $format)

$fontSub = New-Object System.Drawing.Font('Arial', 18, [System.Drawing.FontStyle]::Bold)
$g.DrawString('POLITEKNIK', $fontSub, $brushOrange, 200, 250, $format)

$outDir = "public"
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir }
$bmp.Save("public/lp3i_logo.png", [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Host "LP3I Logo PNG created successfully!"
