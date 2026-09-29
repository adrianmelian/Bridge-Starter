$ErrorActionPreference = 'Stop'
$starterRoot = Split-Path -Parent $PSScriptRoot
$previousFlags = $env:CARGO_ENCODED_RUSTFLAGS
$cacheRoot = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
try {
  # Avoid embedding the builder's personal paths in panic/source locations.
  $remaps = @("--remap-path-prefix=$starterRoot=/bridge", "--remap-path-prefix=$cacheRoot=/cargo", "--remap-path-prefix=$env:USERPROFILE=/user")
  $env:CARGO_ENCODED_RUSTFLAGS = ($remaps -join [char]31)
  Push-Location -LiteralPath $starterRoot
  try { & npm.cmd run desktop:build; if ($LASTEXITCODE -ne 0) { throw 'Starter build failed.' } } finally { Pop-Location }
} finally { $env:CARGO_ENCODED_RUSTFLAGS = $previousFlags }
