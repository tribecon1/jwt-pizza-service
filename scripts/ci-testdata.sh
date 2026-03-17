set -euo pipefail

host="http://localhost:3000"

echo "Calling Service API at $host to insert test data"

auth_tmp="$(mktemp)"
auth_code="$(curl -sS -o "$auth_tmp" -w "%{http_code}" -X PUT "$host/api/auth" \
  -d '{"email":"a@jwt.com", "password":"admin"}' \
  -H 'Content-Type: application/json' || true)"

echo "Auth status: $auth_code"
echo "Auth response body:"
cat "$auth_tmp"
echo

if [ "$auth_code" -lt 200 ] || [ "$auth_code" -ge 300 ]; then
  echo "Auth request failed (expected 2xx)."
  exit 1
fi

if ! jq -e . "$auth_tmp" >/dev/null 2>&1; then
  echo "Auth response was not valid JSON (jq parse failed)."
  exit 1
fi

token="$(jq -r '.token // empty' "$auth_tmp")"
if [ -z "$token" ] || [ "$token" = "null" ]; then
  echo "Auth response JSON did not contain a token."
  exit 1
fi

# Users
curl -sS -X POST "$host/api/auth" -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'
curl -sS -X POST "$host/api/auth" -d '{"name":"pizza franchisee", "email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json'

# Menu
curl -sS -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Veggie", "description": "A garden of delight", "image":"pizza1.png", "price": 0.0038 }'  -H "Authorization: Bearer $token"
curl -sS -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Pepperoni", "description": "Spicy treat", "image":"pizza2.png", "price": 0.0042 }'  -H "Authorization: Bearer $token"
curl -sS -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Margarita", "description": "Essential classic", "image":"pizza3.png", "price": 0.0042 }'  -H "Authorization: Bearer $token"
curl -sS -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Crusty", "description": "A dry mouthed favorite", "image":"pizza4.png", "price": 0.0028 }'  -H "Authorization: Bearer $token"
curl -sS -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Charred Leopard", "description": "For those with a darker side", "image":"pizza5.png", "price": 0.0099 }'  -H "Authorization: Bearer $token"

# Franchise + Store
curl -sS -X POST "$host/api/franchise" -H 'Content-Type: application/json' \
  -d '{"name": "pizzaPocket", "admins": [{"email": "f@jwt.com"}]}' \
  -H "Authorization: Bearer $token"

curl -sS -X POST "$host/api/franchise/1/store" -H 'Content-Type: application/json' \
  -d '{"franchiseId": 1, "name":"SLC"}' \
  -H "Authorization: Bearer $token"
