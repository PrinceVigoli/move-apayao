const CONTACT_VISIBLE_STATUSES = new Set(["accepted", "arrived", "in_progress"]);

/** Direct phone contact exists only from accepted pickup through ride end. */
export function isTripContactVisible(status: string): boolean {
  return CONTACT_VISIBLE_STATUSES.has(status);
}
