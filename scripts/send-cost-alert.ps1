param(
 [Parameter(Mandatory=$true)][string]$ReceiptFile,
 [string]$CredentialFile = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'work/cost-watch-token.xml')
)
$ErrorActionPreference='Stop'
$secure=Import-Clixml -LiteralPath $CredentialFile
$credential=[Net.NetworkCredential]::new('cost-watch',$secure)
$body=Get-Content -LiteralPath $ReceiptFile -Raw
try {
 $response=Invoke-RestMethod -Uri 'https://spawn.aztlan-eng.com/internal/cost-watch/alert' -Method Post -ContentType 'application/json' -Headers @{Authorization=('Bearer '+$credential.Password)} -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20
 $response | ConvertTo-Json -Compress
} finally {$credential=$null;$secure=$null}
