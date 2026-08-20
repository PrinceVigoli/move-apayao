# Hardware-neutral IoT GPS guide

The IoT foundation does not depend on a tracker brand. The future device only
needs to send coordinates over HTTPS, or have a small adapter translate its
vendor protocol into the MOVE JSON contract.

## Architecture

```text
GPS tracker or vendor cloud
          |
          | HTTPS JSON (vendor adapter when required)
          v
POST /api/iot/v1/locations
          |
          +-- fleet_vehicles                  latest position
          +-- vehicle_location_points         complete raw history
          +-- driver_location_points          sampled GIS history
          +-- Redis vehicle location channel live passenger tracking
```

The smartphone GPS remains a separate source. It controls driver availability,
nearby-driver matching, and booking dispatch. For an assigned trip, fresh IoT
coordinates are preferred because they represent the physical vehicle; the
smartphone coordinates automatically take over if IoT updates stop.

The tracker never receives a driver email, password, access token, or refresh
token. It gets a revocable per-device token whose SHA-256 hash is stored in
Postgres. Device management is restricted to `developer` and `superadmin`;
provincial administrators cannot use those endpoints.

## When the e-jeepney arrives

Confirm these capabilities before buying or activating a SIM plan:

- Configurable HTTPS endpoint or a documented vendor-cloud webhook/API.
- Latitude, longitude, UTC capture time, and a unique message/event ID.
- Preferably accuracy, speed, heading, battery, and cellular signal.
- TLS support and a way to store an API token securely.
- A moving update interval around 10–15 seconds and a slower idle interval.
- Local buffering and later upload during temporary signal loss.

If the tracker speaks MQTT, TCP, SMS, or a proprietary payload, keep the core
API unchanged. Add a small vendor adapter that validates the vendor message and
then calls the HTTPS endpoint below.

## Provisioning sequence

Run the API, sign in as a developer or superadmin, and keep the returned bearer
access token in `$accessToken` for the examples below.

### 1. Register the vehicle

```powershell
$headers = @{ Authorization = "Bearer $accessToken" }
$vehicle = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:5000/api/iot/vehicles" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"plateNumber":"APY-1001","label":"Pilot E-Jeepney 1","capacity":15}'
```

### 2. Assign an approved driver

Replace the driver ID with the approved driver's UUID.

```powershell
$assignmentBody = @{
  vehicleId = $vehicle.vehicle.id
  driverId = "REPLACE-WITH-DRIVER-UUID"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://localhost:5000/api/iot/assignments" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $assignmentBody
```

Assignments are historical records. Assigning a new driver closes the old
assignment instead of overwriting it.

### 3. Provision the tracker

```powershell
$deviceBody = @{
  vehicleId = $vehicle.vehicle.id
  label = "Cabin tracker"
  protocol = "https_json_v1"
} | ConvertTo-Json

$provisioned = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:5000/api/iot/devices/provision" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $deviceBody
```

Save `$provisioned.token` immediately in the tracker or vendor secret vault.
The API stores only its hash and cannot show the raw token again. Provisioning
a replacement tracker automatically revokes the previous tracker for that
vehicle.

## Telemetry contract

Send:

```http
POST /api/iot/v1/locations
X-Device-ID: <provisioned externalId>
Authorization: Device <one-time provisioning token>
Content-Type: application/json
```

```json
{
  "eventId": "fix-20260820-000001",
  "capturedAt": "2026-08-20T08:30:00.000Z",
  "lat": 18.2340899,
  "lon": 121.3670283,
  "accuracyM": 6.5,
  "speedMps": 8.2,
  "headingDegrees": 42,
  "batteryPercent": 93,
  "signalDbm": -81
}
```

Each `eventId` must be unique per device. Repeated events are accepted as
duplicates without creating another history row. By default, buffered
observations up to seven days old are accepted (configure
`IOT_MAX_BACKFILL_AGE_HOURS`); points more than five minutes in the future are
rejected. Delayed observations are retained in history and GIS processing but
cannot replace a newer live position.

## Operational notes

- Use HTTPS in every non-local environment; never expose this endpoint over
  plain HTTP to a real tracker.
- Redis carries live updates but Postgres/PostGIS remains the durable source.
- A GPS unit can record points without cellular signal only if it supports
  local/offline buffering. Those points become visible after connectivity
  returns; no device can provide live server updates while it has no data link.
- Passenger trip tracking prefers the assigned vehicle's IoT channel while it
  is fresh, then falls back to the assigned driver's smartphone channel.
- Revoke a lost/compromised device with
  `PATCH /api/iot/devices/{device-uuid}/revoke`.
- Do not log device tokens, passenger phone numbers, or raw precise location
  payloads in application logs.
- Define a retention policy before a large rollout; raw 10-second telemetry is
  about 8,640 observations per continuously reporting vehicle per day.
