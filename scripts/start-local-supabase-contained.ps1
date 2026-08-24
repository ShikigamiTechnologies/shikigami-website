param([string]$NetworkName = 'shikigami-localhost-only')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root 'supabase\config.toml'
if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { throw 'Supabase config.toml was not found.' }

$existing = docker network inspect $NetworkName 2>$null
if ($LASTEXITCODE -ne 0) {
    docker network create --driver bridge --opt 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' $NetworkName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the localhost-only Docker network.' }
} else {
    $network = $existing | ConvertFrom-Json
    if ($network[0].Options.'com.docker.network.bridge.host_binding_ipv4' -ne '127.0.0.1') {
        throw "Docker network $NetworkName is not localhost-only."
    }
}

Push-Location $root
try {
    & npx.cmd --no-install supabase stop
    if ($LASTEXITCODE -ne 0) { throw 'Supabase stop failed; existing data was left untouched.' }
    & npx.cmd --no-install supabase start --network-id $NetworkName
    if ($LASTEXITCODE -ne 0) { throw 'Supabase start on the localhost-only network failed.' }
} finally { Pop-Location }

$unsafe = @(Get-NetTCPConnection -State Listen -LocalPort (54320..54329) -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') })
$firewallName = 'Shikigami Cypher Local Supabase - Block LAN'
$firewall = Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue |
    Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' }
if ($unsafe.Count -gt 0 -and -not $firewall) {
    throw 'Unsafe Supabase listeners remain without the required Windows firewall containment rule.'
}

$apiStatus = (Invoke-WebRequest 'http://127.0.0.1:54321/rest/v1/' -UseBasicParsing -TimeoutSec 5).StatusCode
if ($apiStatus -ne 200) { throw "Local Supabase API health failed with HTTP $apiStatus." }

[ordered]@{
    schema_version = 'cypher.local-supabase-containment.v1'
    status = if ($unsafe.Count -eq 0) { 'loopback_bound' } else { 'windows_firewall_contained' }
    network = $NetworkName
    host_binding_ipv4 = '127.0.0.1'
    firewall_rule = if ($firewall) { $firewallName } else { $null }
    localhost_api_status = $apiStatus
    ports = @(54320..54329)
    external_actions = 0
} | ConvertTo-Json -Depth 3
