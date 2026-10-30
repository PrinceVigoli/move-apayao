# Howen ME MDVR GPS integration assessment

Reviewed on 2026-09-23. Status: manuals reviewed; vendor connection is not implemented or tested against a vehicle.

## Findings from the supplied manuals

Page references below are PDF page numbers, starting at 1. The files are in the user's Downloads folder.

| Manual | Pages | Integration evidence |
| --- | --- | --- |
| Quick Start Manual for ME MDVR-V1.7 | 19–21 | SYSTEM > REGISTER INFO configures the unique Phone NO used to register the device. Page 21's screenshot shows Server1 T-protocol, Server2 H-protocol, and separate GPS Interval fields with example value 10. It does not define the interval's units or either wire protocol. |
| Quick Start Manual for ME MDVR-V1.7 | 21 | NETWORK > DIAL SET enables cellular data and configures the SIM operator's APN. NETWORK > CENTER SET configures Center1's server IP/domain; the documented default port is 6608. INFO reports network/server connection status. |
| Quick Start Manual for ME MDVR-V1.7 | 24–26, 37 | Register the matching DEVICE NO / Phone NO on CMS. CMS licensing is described. The architecture routes devices through CMS to clients. Confirm current licensing with the supplier; these instructions describe the supplied version. |
| CMSServer User Installation Manual | 22 | The port table identifies 6608 as the gateway device service using UDP. This is not an HTTP GPS endpoint. The quick-start guide also lists a wider TCP/UDP port range; the installed server version must determine actual requirements. |
| User Manual for MDVR ME-V1.1 | 10, 23–24 | Describes uploading GPS location through the cellular module and configuring center, local network, dial, and Wi-Fi settings. |
| User manual for VSS Client software-V1.0 | 3–4 | Login uses a server address and account. Screenshots show device identity, GPS time, location, speed, map position, and track playback. No machine-readable API contract is supplied. |
| User Manual For MDVR Installation On Vehicle-V1.0 | Entire document reviewed | Physical installation, antennas, wiring, and commissioning; no GPS integration protocol specification. |
| User Manual for Export Tool-V1.0 | 1–4 | Describes exporting recordings from HDD/SD storage, not a live GPS feed. Contains Howen's website branding. |

The manuals and screenshots identify the Howen ecosystem. The installed model, firmware, server product/version, enabled protocols, and network connectivity still need confirmation. A screenshot of two server protocol fields is insufficient evidence that both connections operate simultaneously on this vehicle.

## Proposed connection

First establish whether a supplier-hosted CMS/VSS platform already receives the vehicle's GPS. If its supported API exposes positions, implement a server-side adapter:

```text
E-jeep Howen MDVR
    -> SIM/mobile data
    -> existing CMS/VSS server
    -> MOVE vendor adapter (documented API/subscription)
    -> POST /api/iot/v1/locations
    -> stored vehicle positions and existing live tracking
```

Keep CMS/VSS login credentials in the adapter's server-side configuration. Map each vendor device identity to its MOVE provisioned externalId/token and vehicle. The vendor Phone NO is a device registration identity; do not assume it is the driver's or SIM's telephone number.

If no usable CMS/VSS API exists, the alternative is a protocol receiver implementing the exact supported device protocol. Obtain the protocol specification and packet examples before choosing TCP/UDP ports or writing a decoder. The supplied manuals do not establish JT/T 808 compatibility, HTTP JSON support, or protocol framing/authentication rules.

Do not enter MOVE's HTTPS API address into CENTER SET and expect it to work: MOVE accepts authenticated HTTP JSON, while the documented CMS gateway uses a different transport/protocol. Retain the existing working server configuration until the replacement or second connection is validated.

## Existing MOVE integration points

- `artifacts/api-server/src/routes/iot.ts`: vehicle registration, driver assignments, device provisioning/revocation, and telemetry ingestion.
- `lib/db/src/schema/vehicles.ts`: fleet vehicles, device identities, assignments, and durable location history.
- `artifacts/api-server/src/routes/tracking.ts`: assigned-trip location stream, preferring fresh vehicle GPS with driver-phone fallback.
- `IOT_GPS_GUIDE.md`: provisioning instructions and the current telemetry contract.

The adapter must send:

```http
POST /api/iot/v1/locations
X-Device-ID: <MOVE provisioned externalId>
Authorization: Device <MOVE provisioned token>
Content-Type: application/json
```

| MOVE field | Required vendor information / conversion |
| --- | --- |
| `eventId` | Stable per-device observation identity, 8–64 characters. Repeated polling/retries must retain the same identity. Determine a deterministic mapping after reviewing vendor data. |
| `capturedAt` | Actual GPS observation time converted to an ISO UTC timestamp; do not substitute polling time for an old observation. Confirm timezone/epoch units. |
| `lat`, `lon` | Valid latitude/longitude in decimal degrees. Confirm coordinate system, order, scaling, hemispheres, and valid-fix indicators. Reject invalid fixes. |
| `speedMps` | Optional. Confirm vendor units; divide km/h by 3.6 if applicable. |
| `headingDegrees` | Optional. Confirm vendor definition and range. |
| `accuracyM`, `batteryPercent`, `signalDbm` | Optional. Omit when absent; do not invent defaults or confuse vehicle supply voltage with battery percentage. |

MOVE already handles duplicate events and prevents delayed locations from replacing newer live positions. Driver-phone GPS still controls driver availability and nearby-driver matching; connecting MDVR telemetry alone does not move those functions to vehicle GPS.

## Information to request from the supplier

Copy this request to the supplier when convenient:

> We are integrating the e-jeep's built-in Howen MDVR GPS into MOVE Apayao. Please provide the exact MDVR model and firmware, the installed CMS/VSS product and version, its server URL, and the API/SDK documentation matching that version. We need authenticated access to device IDs, latest GPS position, GPS observation time, valid-fix status, speed, heading, online status, and historical/buffered positions. Please include login/token renewal, polling limits or real-time subscription instructions, a sample GPS response, coordinate/time/unit definitions, and API licensing requirements. If platform API access is unavailable, please provide the supported T-protocol/H-protocol specification, example packets, authentication/acknowledgement requirements, and confirm whether a second server can receive GPS while the existing monitoring service remains active.

No supplier message has been sent automatically.

## Completion and verification sequence

1. Confirm existing app/site, vehicle model/firmware, device registration ID, GPS fix, SIM connectivity, and actual CMS/VSS version.
2. Obtain the matching vendor API/protocol documentation and one redacted real GPS sample.
3. Implement the adapter against that verified contract, including credential renewal/reconnect, device mapping, validity checks, timestamp conversion, stable event IDs, and bounded retries.
4. Provision one pilot vehicle/device in MOVE and assign its approved driver using `IOT_GPS_GUIDE.md`.
5. Compare one vehicle's vendor GPS fix/time with MOVE's stored location and assigned-trip stream.
6. Verify duplicate polling, invalid fixes, expired vendor credentials, network interruption, delayed uploads, out-of-order observations, and phone fallback.
7. Confirm actual reporting cadence fits the configured IoT freshness window (default 45 seconds) before activating the live fleet feed.

Implementation is pending the vendor contract and deployment details. No device settings, production services, or application runtime code were changed during this assessment.
