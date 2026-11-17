# KAM GRAINS networking

## Normal PC usage

The default frontend API configuration is:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`

The frontend reads `VITE_API_BASE_URL`. The checked-in local default is
localhost, so normal PC usage does not depend on Wi-Fi, hotspot, or the PC's
current LAN address.

## Optional phone/LAN usage

1. Connect the phone and PC to the same LAN or hotspot.
2. Find the PC's current IPv4 address.
3. Open `http://<PC_CURRENT_IP>:5173` on the phone.

When the frontend is opened from a non-localhost hostname, its localhost
default automatically changes the API host to the browser hostname on port
3000 (`http://<PC_CURRENT_IP>:3000/api`). No source-code edit is needed when
the PC receives a different address. An explicitly configured non-localhost
`VITE_API_BASE_URL` remains authoritative.

The backend listens on `0.0.0.0:3000`. Windows Firewall and the network's
client-isolation settings must still permit the optional phone connection.
The backend allows localhost origins and private IPv4 origins on port 5173;
additional exact origins can be supplied with the comma-separated
`CORS_ORIGINS` environment variable. Credentialed CORS is disabled; the ERP's
existing bearer-token authentication is preserved.
