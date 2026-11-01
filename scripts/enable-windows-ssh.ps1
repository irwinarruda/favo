# Run once on a Windows machine, in PowerShell as administrator, so another machine can reach it.
# Windows has no Tailscale SSH server, so favo needs the OpenSSH server that ships with Windows.
param(
  [Parameter(Mandatory = $true)]
  [string]$PublicKey
)

$ErrorActionPreference = 'Stop'

$rule = 'OpenSSH-Server-In-TCP'
$adapter = 'Tailscale'
$tailnet = '100.64.0.0/10'

$PublicKey = $PublicKey.Trim()
if ($PublicKey -eq '' -or $PublicKey -match '[\r\n]') {
  throw 'PublicKey must be a single line: the one line of your .pub file.'
}
if (-not (Get-NetAdapter -Name $adapter -ErrorAction SilentlyContinue)) {
  throw "No network adapter named $adapter here. Install Tailscale, then run this again."
}

Write-Output 'Installing the OpenSSH server. Windows downloads about 250 MB, so this can take ten minutes.'
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null

# Only the tailnet can reach it. This comes before sshd can run, so a failure here leaves nothing listening.
# -ErrorAction is explicit because $ErrorActionPreference does not reach these module commands.
if (Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue) {
  Set-NetFirewallRule -Name $rule -RemoteAddress $tailnet -InterfaceAlias $adapter -ErrorAction Stop
} else {
  New-NetFirewallRule -Name $rule -DisplayName 'OpenSSH SSH Server (sshd)' -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -RemoteAddress $tailnet -InterfaceAlias $adapter -ErrorAction Stop | Out-Null
}

Set-Service -Name sshd -StartupType Automatic
Start-Service -Name sshd

# After the first start, because that start creates this folder.
# Members of Administrators read this file, not ~/.ssh/authorized_keys.
$keys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
Add-Content -Path $keys -Value $PublicKey
# SIDs, because the group names are translated on localized Windows.
icacls $keys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null

Write-Output 'SSH is on. Your key is installed, and only your tailnet can reach it.'
