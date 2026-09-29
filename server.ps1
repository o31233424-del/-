$prefix = 'http://127.0.0.1:8766/'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::Expect100Continue = $false

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Output 'Не удалось запустить сервер на http://127.0.0.1:8766/'
    Write-Output $_.Exception.Message
    Write-Output 'Закройте другую копию программы или запустите PowerShell от имени администратора.'
    exit 1
}
Write-Output "SERVING $prefix"
Write-Output 'Откройте в браузере: http://127.0.0.1:8766/'

function Send-Text($ctx, $status, $contentType, $text) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    $ctx.Response.StatusCode = $status
    $ctx.Response.ContentType = $contentType
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
}

function Send-Bytes($ctx, $contentType, $bytes) {
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = $contentType
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $path = $ctx.Request.Url.LocalPath.TrimStart('/')
        if ($ctx.Request.HttpMethod -eq 'OPTIONS') {
            $ctx.Response.StatusCode = 204
            $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
            $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, OPTIONS')
            $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Accept, Content-Type')
            $ctx.Response.Close()
            continue
        }
        if ($path -eq 'proxy') {
            $target = $ctx.Request.QueryString['url']
            if ([string]::IsNullOrWhiteSpace($target) -or $target -notmatch '^https://') {
                Send-Text $ctx 400 'text/plain; charset=utf-8' 'bad url'
                continue
            }
            $req = [System.Net.HttpWebRequest]::Create($target)
            $req.Method = 'GET'
            $req.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            $req.Accept = 'text/html,application/json,text/plain,*/*'
            $req.Headers.Add('Accept-Language', 'ru-RU,ru;q=0.9,en;q=0.8')
            $req.Headers.Add('Cookie', 'beget=begetok')
            $req.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
            $req.Timeout = 40000
            $req.ReadWriteTimeout = 40000
            $req.AllowAutoRedirect = $true
            try {
                $resp = $req.GetResponse()
                $stream = $resp.GetResponseStream()
                $ms = New-Object IO.MemoryStream
                $stream.CopyTo($ms)
                $bytes = $ms.ToArray()
                $ctype = $resp.ContentType
                if ([string]::IsNullOrWhiteSpace($ctype)) { $ctype = 'text/html; charset=utf-8' }
                $resp.Close()
                if ($bytes.Length -gt 2500000) {
                    Send-Text $ctx 502 'text/plain; charset=utf-8' 'too large'
                    continue
                }
                Send-Bytes $ctx $ctype $bytes
            } catch {
                Send-Text $ctx 502 'text/plain; charset=utf-8' ('proxy error: ' + $_.Exception.Message)
            }
            continue
        }
        if ($path -eq 'health') {
            Send-Text $ctx 200 'text/plain; charset=utf-8' 'ok'
            continue
        }
        if ([string]::IsNullOrWhiteSpace($path)) {
            $html = Get-ChildItem -LiteralPath $root -Filter '*.html' | Select-Object -First 1
            if ($html) { $path = $html.Name }
        }
        $file = Join-Path $root ([Uri]::UnescapeDataString($path))
        if (Test-Path -LiteralPath $file) {
            $bytes = [IO.File]::ReadAllBytes($file)
            $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
            $ctype = switch ($ext) {
                '.html' { 'text/html; charset=utf-8' }
                '.js' { 'text/javascript; charset=utf-8' }
                '.css' { 'text/css; charset=utf-8' }
                '.json' { 'application/json; charset=utf-8' }
                default { 'application/octet-stream' }
            }
            Send-Bytes $ctx $ctype $bytes
        } else {
            Send-Text $ctx 404 'text/plain; charset=utf-8' 'not found'
        }
    } catch {
        try { Send-Text $ctx 500 'text/plain; charset=utf-8' $_.Exception.Message } catch {}
    }
}
