import { customFetch } from "./custom-fetch";

export type PassengerPoint = {
  lat: number;
  lon: number;
  accuracyM: number | null;
  capturedAt: string;
};
export type PassengerMapPin = PassengerPoint & {
  reservationId: number;
  name: string;
  pickupName: string;
  hasAvatar: boolean;
  avatarVersion: string;
};
const sharingUrl = (id: number) =>
  `/api/fixed-loop/reservations/${id}/location-sharing`;
export const startPassengerSharing = (id: number, point: PassengerPoint) =>
  customFetch<{ sharingId: string }>(sharingUrl(id), {
    method: "POST",
    body: JSON.stringify(point),
  });
export const updatePassengerSharing = (
  id: number,
  sharingId: string,
  point: PassengerPoint,
) =>
  customFetch(sharingUrl(id), {
    method: "PUT",
    body: JSON.stringify({ sharingId, ...point }),
  });
export const stopPassengerSharing = (id: number, sharingId: string) =>
  customFetch(sharingUrl(id), {
    method: "DELETE",
    body: JSON.stringify({ sharingId }),
  });
export const getPassengerMapPins = (runId: number) =>
  customFetch<{ passengers: PassengerMapPin[] }>(
    `/api/fixed-loop/runs/${runId}/passenger-locations`,
  );
export const getPassengerAvatar = (reservationId: number) =>
  customFetch<{ avatarUrl: string | null }>(
    `/api/fixed-loop/reservations/${reservationId}/passenger-avatar`,
  );
