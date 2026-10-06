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
  $prompt = New-Object System.Speech.Synthesis.PromptBuilder
  $prompt.AppendBreak([TimeSpan]::FromMilliseconds(1500))
  $prompt.AppendText('apex move pawn e two e four')
  $prompt.AppendBreak([TimeSpan]::FromMilliseconds(2000))
  $testVoice.Speak($prompt)
  $testVoice.SetOutputToWaveFile((Join-Path (Get-Location) 'tests\fixtures\last-move.wav'))
  $lastMove = New-Object System.Speech.Synthesis.PromptBuilder
  $lastMove.AppendBreak([TimeSpan]::FromMilliseconds(1500))
  $lastMove.AppendText('apex last move')
  $lastMove.AppendBreak([TimeSpan]::FromMilliseconds(2000))
  $testVoice.Speak($lastMove)
  $testVoice.SetOutputToWaveFile((Join-Path (Get-Location) 'tests\fixtures\paused-move.wav'))
  $pausedMove = New-Object System.Speech.Synthesis.PromptBuilder
  $pausedMove.AppendBreak([TimeSpan]::FromMilliseconds(2000))
  $pausedMove.AppendText('one two three one two three apex move pawn e two')
  $pausedMove.AppendBreak([TimeSpan]::FromMilliseconds(4500))
  $pausedMove.AppendText('e four')
  $pausedMove.AppendBreak([TimeSpan]::FromMilliseconds(2500))
  $testVoice.Speak($pausedMove)
} finally { $testVoice.Dispose() }
