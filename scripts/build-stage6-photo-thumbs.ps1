$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$folder = Join-Path $PSScriptRoot '..\public\images\voyager'
$names = @('v1-io-plumes-1979','v1-europa-1979','v2-europa-1979','v1-ganymede-1979',
  'v1-galilean-1979','v1-titan-haze-1980','v2-titania-1986','v2-miranda-1986')
foreach ($name in $names) {
  $sourcePath = Join-Path $folder "$name.jpg"
  $targetPath = Join-Path $folder "$name-thumb.jpg"
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $maxSide = if ($source.Width -le 400) { 80 } else { 240 }
    $factor = [Math]::Min(1.0, ($maxSide / [Math]::Max($source.Width, $source.Height)))
      $width = [Math]::Max(1, [int][Math]::Round($source.Width * $factor))
      $height = [Math]::Max(1, [int][Math]::Round($source.Height * $factor))
      $thumb = New-Object System.Drawing.Bitmap($width, $height)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($thumb)
        try {
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.DrawImage($source, 0, 0, $width, $height)
        } finally { $graphics.Dispose() }
        $thumb.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
      } finally { $thumb.Dispose() }
    if ((Get-Item $targetPath).Length -ge (Get-Item $sourcePath).Length) {
      throw "No se pudo reducir la miniatura de $name"
    }
    Write-Output "$name $width x $height : $((Get-Item $targetPath).Length) bytes"
  } finally { $source.Dispose() }
}
