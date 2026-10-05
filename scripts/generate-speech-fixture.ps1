# Uses an installed Windows voice; never records the user's microphone.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force -Path tests\fixtures | Out-Null
Add-Type -AssemblyName System.Speech
$testVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $english = $testVoice.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1
  if (-not $english) { throw 'Install an English US Windows voice to generate this optional fixture.' }
  $testVoice.SelectVoice($english.VoiceInfo.Name)
  $testVoice.SetOutputToWaveFile((Join-Path (Get-Location) 'tests\fixtures\move.wav'))
  $testVoice.Speak('apex move pawn e two e four')
} finally { $testVoice.Dispose() }
