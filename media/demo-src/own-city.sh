#!/bin/bash
set -e
cd "$(dirname "$0")"
node make-session.mjs >/dev/null
SUB=$(python3 -c "
import json,base64
d=json.load(open('out/state.json'))
jwt=[k['value'] for k in d['origins'][0]['localStorage'] if k['name'].startswith('__convexAuthJWT')][0]
p=jwt.split('.')[1]; p+='='*(-len(p)%4)
print(json.loads(base64.urlsafe_b64decode(p))['sub'].split('|')[0])")
(cd ../.. && CONVEX_DEPLOY_KEY=$(security find-generic-password -s CONVEX_DEPLOY_KEY -a zabuton -w) npx convex run dev:setCityOwner "{\"slug\":\"$1\",\"userId\":\"$SUB\"}" >/dev/null)
echo "session owns $1"
