# Derive compact runtime images and provenance masks. Original Voyager JPEGs stay untouched.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class MoonTextureDerivatives {
    public static void Write(string originalPath, string generatedPath, string outputPath, string maskPath, double feather = 12.0) {
        using (var original = new Bitmap(originalPath))
        using (var generated = new Bitmap(generatedPath)) {
            if (original.Width != 2 * original.Height || generated.Width != 2 * generated.Height)
                throw new Exception("Both source and illustration must be equirectangular 2:1 images.");
            ImageCodecInfo jpeg = null;
            foreach (var codec in ImageCodecInfo.GetImageEncoders())
                if (codec.MimeType == "image/jpeg") jpeg = codec;
            using (var settings = new EncoderParameters(1)) {
                settings.Param[0] = new EncoderParameter(Encoder.Quality, 90L);
                generated.Save(outputPath, jpeg, settings);
            }

            int width = original.Width, height = original.Height, count = width * height;
            int[] distance = new int[count], queue = new int[count];
            bool[] black = new bool[count], exterior = new bool[count];
            int head = 0, tail = 0;
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                int i = y * width + x;
                Color pixel = original.GetPixel(x, y);
                // Pure-black background, including low JPEG ringing, is not observed terrain.
                black[i] = Math.Max(pixel.R, Math.Max(pixel.G, pixel.B)) < 20;
            }
            // Only black connected to the image border is the uncharted backdrop;
            // isolated dark pixels inside photographed terrain remain authentic.
            for (int x = 0; x < width; x++) {
                int top = x, bottom = (height - 1) * width + x;
                if (black[top]) { exterior[top] = true; queue[tail++] = top; }
                if (black[bottom]) { exterior[bottom] = true; queue[tail++] = bottom; }
            }
            for (int y = 1; y < height - 1; y++) {
                int left = y * width, right = left + width - 1;
                if (black[left]) { exterior[left] = true; queue[tail++] = left; }
                if (black[right]) { exterior[right] = true; queue[tail++] = right; }
            }
            while (head < tail) {
                int i = queue[head++], x = i % width, y = i / width;
                int left = y * width + (x == 0 ? width - 1 : x - 1);
                int right = y * width + (x == width - 1 ? 0 : x + 1);
                if (black[left] && !exterior[left]) { exterior[left] = true; queue[tail++] = left; }
                if (black[right] && !exterior[right]) { exterior[right] = true; queue[tail++] = right; }
                if (y > 0 && black[i - width] && !exterior[i - width]) { exterior[i - width] = true; queue[tail++] = i - width; }
                if (y + 1 < height && black[i + width] && !exterior[i + width]) { exterior[i + width] = true; queue[tail++] = i + width; }
            }
            head = 0;
            tail = 0;
            for (int i = 0; i < count; i++) {
                distance[i] = exterior[i] ? 0 : Int32.MaxValue;
                if (exterior[i]) queue[tail++] = i;
            }
            while (head < tail) {
                int i = queue[head++], x = i % width, y = i / width, next = distance[i] + 1;
                int left = y * width + (x == 0 ? width - 1 : x - 1);
                int right = y * width + (x == width - 1 ? 0 : x + 1);
                if (next < distance[left]) { distance[left] = next; queue[tail++] = left; }
                if (next < distance[right]) { distance[right] = next; queue[tail++] = right; }
                if (y > 0 && next < distance[i - width]) { distance[i - width] = next; queue[tail++] = i - width; }
                if (y + 1 < height && next < distance[i + width]) { distance[i + width] = next; queue[tail++] = i + width; }
            }
            using (var mask = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
                for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                    double t = Math.Min(1.0, distance[y * width + x] / feather);
                    int value = (int)Math.Round(255.0 * t * t * (3.0 - 2.0 * t));
                    mask.SetPixel(x, y, Color.FromArgb(value, value, value));
                }
                mask.Save(maskPath, ImageFormat.Png);
            }
        }
    }
}
'@

$root = Split-Path -Parent $PSScriptRoot
$maps = Join-Path $root 'public\textures\moons'
$generated = Join-Path $root 'assets\stage5-1-generations'
[MoonTextureDerivatives]::Write((Join-Path $maps 'titania-voyager-usgs.jpg'), (Join-Path $generated 'titania-illustrative.png'), (Join-Path $maps 'titania-illustrative.jpg'), (Join-Path $maps 'titania-observed-mask.png'), 30.0)
[MoonTextureDerivatives]::Write((Join-Path $maps 'triton-voyager-usgs.jpg'), (Join-Path $generated 'triton-illustrative.png'), (Join-Path $maps 'triton-illustrative.jpg'), (Join-Path $maps 'triton-observed-mask.png'), 48.0)
[MoonTextureDerivatives]::Write((Join-Path $maps 'io-voyager-usgs.jpg'), (Join-Path $generated 'io-illustrative.png'), (Join-Path $maps 'io-illustrative.jpg'), (Join-Path $maps 'io-observed-mask.png'))
[MoonTextureDerivatives]::Write((Join-Path $maps 'miranda-voyager-usgs.jpg'), (Join-Path $generated 'miranda-illustrative.png'), (Join-Path $maps 'miranda-illustrative.jpg'), (Join-Path $maps 'miranda-observed-mask.png'))
