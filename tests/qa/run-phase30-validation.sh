#!/bin/bash
cd /home/rodneyzam/Developer/software/crm-inmobiliario

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000

npx next start --hostname 127.0.0.1 &
DEV_PID=$!

echo "Server PID: $DEV_PID"
echo "Waiting 5 seconds for server..."
sleep 5

echo "Running validation..."
node tests/qa/validate-phase30.mjs
RESULT=$?

echo "Stopping dev server..."
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null

exit $RESULT
