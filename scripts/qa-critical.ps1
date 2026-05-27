$env:QA_BASE_URL = if ($env:QA_BASE_URL) { $env:QA_BASE_URL } else { 'http://127.0.0.1:3000' }
$env:QA_SUPABASE_URL = if ($env:QA_SUPABASE_URL) { $env:QA_SUPABASE_URL } else { 'http://127.0.0.1:54321' }
$env:QA_SUPABASE_PUBLISHABLE_KEY = if ($env:QA_SUPABASE_PUBLISHABLE_KEY) { $env:QA_SUPABASE_PUBLISHABLE_KEY } else { 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' }
$env:QA_SUPABASE_SERVICE_KEY = if ($env:QA_SUPABASE_SERVICE_KEY) { $env:QA_SUPABASE_SERVICE_KEY } else { '[REDACTED_SUPABASE_SECRET_KEY]' }

$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).ProviderPath
$env:QA_BASE_URL = $env:QA_BASE_URL
$env:QA_SUPABASE_URL = $env:QA_SUPABASE_URL
$env:QA_SUPABASE_PUBLISHABLE_KEY = $env:QA_SUPABASE_PUBLISHABLE_KEY
$env:QA_SUPABASE_SERVICE_KEY = $env:QA_SUPABASE_SERVICE_KEY

Set-Location $repoPath
$playwrightCli = Join-Path $repoPath 'node_modules\playwright\cli.js'
node $playwrightCli test tests/qa/auth-invitations-team.spec.cjs --workers=1 --reporter=line
exit $LASTEXITCODE
