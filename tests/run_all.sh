#!/bin/sh
# Runs every simulation + the script-order check. Needs three@0.147.0:  npm i three@0.147.0  (set NODE_PATH to its node_modules)
cd "$(dirname "$0")/.." || exit 1
fail=0
for t in tests/load_order.check.js tests/worldstate.sim.js tests/verbs.sim.js tests/vaults.sim.js tests/events.sim.js tests/flight_fps.sim.mjs tests/soccer.sim.js tests/scatter_cull.check.mjs tests/feel.sim.mjs tests/dive.sim.js tests/phase2.sim.mjs tests/anim_smoke.check.mjs tests/css_theme.check.js tests/space.sim.mjs tests/camera_flight.sim.mjs tests/space_objects.sim.mjs tests/outlaw_arena.sim.js; do
  out=$(node "$t" 2>&1); code=$?
  if [ $code -ne 0 ]; then echo "✗ $t"; echo "$out" | grep -v '^ok' | head -15; fail=1
  else echo "✓ $t  ($(echo "$out" | grep -c '^ok') checks)"; fi
done
exit $fail
