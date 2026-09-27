# Generates viewer/build/icon.png (512x512) - the application icon.
# electron-builder converts this to the Windows .ico automatically.
# Requires Windows PowerShell (uses System.Drawing).
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir = Join-Path (Split-Path -Parent $root) "viewer\build"
$outFile = Join-Path $outDir "icon.png"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Add-Type -AssemblyName System.Drawing

$S = 512
$bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# Background: rounded square, dark slate with a vertical gradient.
$bg = New-RoundedRectPath 24 24 ($S - 48) ($S - 48) 104
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point 0, 24),
    (New-Object System.Drawing.Point 0, ($S - 24)),
    [System.Drawing.Color]::FromArgb(255, 32, 44, 60),
    [System.Drawing.Color]::FromArgb(255, 16, 24, 36))
$g.FillPath($grad, $bg)

# Accent edge.
$edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 120, 190, 255)), 6
$g.DrawPath($edge, $bg)

# "</>" glyph, centred.
$font = New-Object System.Drawing.Font("Consolas", 210, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 140, 200, 255))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$rectMain = New-Object System.Drawing.RectangleF (0), (-18), ([float]$S), ([float]$S)
$g.DrawString("</>", $font, $brush, $rectMain, $fmt)

# Small "H" badge bottom-right to suggest HTML output.
$bFont = New-Object System.Drawing.Font("Segoe UI", 84, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$bBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 90, 200, 140))
$rectBadge = New-Object System.Drawing.RectangleF (300), (292), (180), (180)
$g.DrawString("H", $bFont, $bBrush, $rectBadge, $fmt)

$bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

Write-Host "Wrote $outFile"
