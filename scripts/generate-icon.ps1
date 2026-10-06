# Build deterministic Windows icon sizes from the same EPDF document mark.
Add-Type -AssemblyName System.Drawing
$assetDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
$frames = @()
foreach ($size in @(16,24,32,48,64,128,256)) {
  $bitmap = New-Object System.Drawing.Bitmap($size,$size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform(($size / 256.0),($size / 256.0))
  $blue = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#2469b4'))
  $light = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#c8def5'))
  $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shape.AddArc(8,8,64,64,180,90);$shape.AddArc(184,8,64,64,270,90)
  $shape.AddArc(184,184,64,64,0,90);$shape.AddArc(8,184,64,64,90,90);$shape.CloseFigure()
  $graphics.FillPath($blue,$shape)
  $paper = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(66,38),[System.Drawing.PointF]::new(148,38),[System.Drawing.PointF]::new(190,80),[System.Drawing.PointF]::new(190,218),[System.Drawing.PointF]::new(66,218))
  $graphics.FillPolygon([System.Drawing.Brushes]::White,$paper)
  $fold = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(148,38),[System.Drawing.PointF]::new(148,80),[System.Drawing.PointF]::new(190,80))
  $graphics.FillPolygon($light,$fold)
  $graphics.FillRectangle($blue,92,106,18,90)
  $graphics.FillRectangle($blue,92,106,70,16);$graphics.FillRectangle($blue,92,142,63,16);$graphics.FillRectangle($blue,92,180,70,16)
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
  $frames += ,@{ Size=$size; Bytes=$stream.ToArray() }
  if ($size -eq 256) { $bitmap.Save((Join-Path $assetDirectory 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png) }
  $stream.Dispose();$graphics.Dispose();$bitmap.Dispose();$shape.Dispose();$blue.Dispose();$light.Dispose()
}
$file = [System.IO.File]::Create((Join-Path $assetDirectory 'icon.ico'))
$writer = New-Object System.IO.BinaryWriter($file)
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$frames.Count)
$offset = 6 + 16 * $frames.Count
foreach ($frame in $frames) {
  $dimension = if ($frame.Size -eq 256) {0} else {$frame.Size}
  $writer.Write([byte]$dimension);$writer.Write([byte]$dimension)
  $writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32)
  $writer.Write([uint32]$frame.Bytes.Length);$writer.Write([uint32]$offset)
  $offset += $frame.Bytes.Length
}
foreach ($frame in $frames) {$writer.Write([byte[]]$frame.Bytes)}
$writer.Dispose();$file.Dispose()
