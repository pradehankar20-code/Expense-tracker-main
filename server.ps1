param(
    [int]$Port = 8000,
    [string]$Path = $PSScriptRoot
)

if ([string]::IsNullOrEmpty($Path)) {
    $Path = (Get-Location).Path
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Error "Failed to start listener on $prefix : $_"
    exit 1
}

Write-Output "Expense Tracker server running at $prefix"
Write-Output "Root directory: $Path"

$rootResolved = (Resolve-Path $Path).Path

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $rawUrl = $request.Url.LocalPath
            $cleanUrl = [System.Uri]::UnescapeDataString($rawUrl)
            if ($cleanUrl -eq "/" -or [string]::IsNullOrWhiteSpace($cleanUrl)) {
                $cleanUrl = "/index.html"
            }

            $relPath = $cleanUrl.TrimStart("/\").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::Combine($rootResolved, $relPath)
            $targetResolved = $null
            
            if (Test-Path -LiteralPath $filePath -PathType Leaf) {
                $targetResolved = (Resolve-Path -LiteralPath $filePath).Path
            }

            if ($targetResolved -and $targetResolved.StartsWith($rootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
                $ext = [System.IO.Path]::GetExtension($targetResolved).ToLowerInvariant()
                $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($targetResolved)

                $response.StatusCode = 200
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
                
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.ContentType = "text/plain"
                $response.ContentLength64 = $errBytes.Length
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
            }
        } catch {
            try {
                $response.StatusCode = 500
            } catch {}
        } finally {
            try {
                $response.OutputStream.Close()
            } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
