const value = (input: string | undefined) => input?.trim() ?? "";
const emailLink = (email: string, subject?: string) =>
  email ? `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}` : "#contact";

export const legalVersion = "2026-10-30";

export const publicContact = {
  operator:
    value(import.meta.env.VITE_SERVICE_OPERATOR) ||
    "Department of Science and Technology (DOST)",
  supportEmail:
    value(import.meta.env.VITE_SUPPORT_EMAIL) || "support@moveapayao.com",
  privacyEmail:
    value(import.meta.env.VITE_PRIVACY_EMAIL) ||
    value(import.meta.env.VITE_SUPPORT_EMAIL) || "support@moveapayao.com",
  phone: value(import.meta.env.VITE_SUPPORT_PHONE),
  address:
    value(import.meta.env.VITE_OFFICE_ADDRESS) ||
    "Apayao, Philippines",
  hours:
    value(import.meta.env.VITE_SUPPORT_HOURS) ||
    "To be confirmed",
};

const appUrls = {
  passengerAndroid: value(import.meta.env.VITE_PASSENGER_ANDROID_URL),
  passengerIos: value(import.meta.env.VITE_PASSENGER_IOS_URL),
  driverAndroid: value(import.meta.env.VITE_DRIVER_ANDROID_URL),
  driverIos: value(import.meta.env.VITE_DRIVER_IOS_URL),
};

export const storesAreLive =
  import.meta.env.VITE_STORES_LIVE === "true" &&
  Boolean(appUrls.passengerAndroid && appUrls.driverAndroid);

export const links = {
  passengerAndroid:
    appUrls.passengerAndroid ||
    emailLink(publicContact.supportEmail, "MOVE Apayao passenger pilot access"),
  passengerIos:
    appUrls.passengerIos ||
    emailLink(publicContact.supportEmail, "MOVE Apayao iOS pilot access"),
  driverAndroid:
    appUrls.driverAndroid ||
    emailLink(publicContact.supportEmail, "MOVE Apayao driver pilot access"),
  driverIos:
    appUrls.driverIos ||
    emailLink(
      publicContact.supportEmail,
      "MOVE Apayao Driver iOS pilot access",
    ),
  documentation: value(import.meta.env.VITE_DOCUMENTATION_URL),
  facebook: value(import.meta.env.VITE_FACEBOOK_URL),
  officialWebsite: "https://www.dost.gov.ph/",
  email: emailLink(publicContact.supportEmail),
  privacyEmail: emailLink(
    publicContact.privacyEmail,
    "MOVE Apayao privacy request",
  ),
  phone: publicContact.phone
    ? `tel:${publicContact.phone.replace(/[^+\d]/g, "")}`
    : "",
};

export const hero = {
  eyebrow: "Pudtol?Luna ? Apayao",
  title: "Your place on the daily e-jeep loop.",
  body: "Choose a departure, select your pickup and drop-off stops, and reserve a numbered seat or standing place on the Pudtol?Luna pilot.",
  primaryCta: "Get the passenger app",
  secondaryCta: "Driver app",
  note: "Free Android pilot downloads. No passenger account fees.",
};

/* sequence of steps for the "How it works" section on the landing page */
export const steps = [
  { n: "01", title: "Find the fixed-loop e-jeep", body: "Open the passenger app to see the assigned unit and its latest location when the driver is sharing fresh GPS." },
  { n: "02", title: "Choose your departure and stops", body: "Select a daily departure and your pickup and drop-off stops in that direction's travel order." },
  { n: "03", title: "Choose an available place", body: "See 19 numbered seats and 10 standing places separately. Your reservation is confirmed when the server returns your reference." },
  { n: "04", title: "Show your reference and board", body: "Show your reservation reference to the driver. Confirm the fare with the operator; no online fare payment is collected by the app." },
];

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export const coverage = {
  eyebrow: "Where we run",
  title: "Pudtol to ASC. Back through Tumog.",
  body: "The daily pilot travels from Pudtol Public Market via Dagupan Gym, Luna National High School and the Provincial Capitol to Apayao State College, using Payanan Road. The return uses the national highway via Tumog National High School and Dagupan Gym to Pudtol Public Market.",
  stats: [{ value: "19 + 10", label: "Seated + standing places" },{ value: "Daily", label: "Scheduled departures" },{ value: "GPS", label: "When the operator is online" }],
  caveat: "Departure times are shown in Philippine time. Follow the assigned e-jeep's location for intermediate pickup; contact the project team about service changes.",
};

export const features = [
 {icon:"MapPin",title:"Vehicle location",body:"See the assigned e-jeep's fresh GPS position while its operator is online. The app tells you when location is unavailable."},
 {icon:"Users",title:"Numbered places",body:"Choose available seats or standing places for your departure and journey. Availability is shared with the driver's walk-in records."},
 {icon:"History",title:"Your reservations",body:"Keep a reservation reference, view its status and cancel eligible bookings before the departure cutoff."},
 {icon:"CloudRain",title:"Daily timetable",body:"Choose a departure today or during the following six days, with separate outbound and return stops."},
 {icon:"TriangleAlert",title:"Report a problem",body:"Send an app bug or suggestion from Profile. Ride and safety reports have a separate reporting path."},
 {icon:"Star",title:"Driver-confirmed boarding",body:"The operator confirms boarding and alighting. Occupied places are not released simply because a timer or GPS position changes."},
];

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

export const drivers = {
 eyebrow:"For the pilot operator",title:"One manifest for reservations and walk-ins.",
 body:"The dedicated e-jeep account opens daily runs, shows passenger references and selected places, and provides boarding and run controls.",
 points:["Confirm reserved passengers have boarded","Record walk-ins against the same available places","Confirm arrival and alighting before places are released","Go online to share the e-jeep's current location"],
 cta:"Download the driver app",note:"The driver app is a separate Android download. Pilot access is assigned by the project team.",
};

export const stakeholders = {
 eyebrow:"For DOST and project partners",title:"A connected pilot service.",
 body:"MOVE Apayao is a project of the Department of Science and Technology (DOST), piloted in Apayao. The operations dashboard supports driver and user administration, fleet oversight, incident reports, app feedback and account-deletion requests.",
 items:[{title:"Assigned pilot operator",body:"A dedicated driver account manages the scheduled e-jeep service."},{title:"Fleet oversight",body:"View available vehicle information and GPS freshness through the operations tools."},{title:"Safety and incident records",body:"Review reports submitted to the project team."},{title:"Passenger feedback",body:"Review app bugs and suggestions in a dedicated inbox."}],
};

export const faqs = [
 {q:"How do I pay?",a:"Confirm the fare and cash collection with the operator. The fixed-loop app does not collect online fare payments."},
 {q:"Which stops are covered?",a:"Pudtol Public Market, Dagupan Gym, Luna National High School, the Provincial Capitol and ASC are on the outbound leg. The return goes from ASC through Tumog National High School and Dagupan Gym to Pudtol Public Market."},
 {q:"Can I choose a specific time?",a:"Yes. Select a scheduled departure in Philippine time. Reservations close at the terminal departure time; intermediate pickup depends on the vehicle's actual progress."},
 {q:"Can I choose my seat?",a:"Choose available numbered seats or standing places. The pilot has 19 seated and 10 standing places. A selected place is confirmed only after successful reservation."},
 {q:"Do I need mobile data?",a:"An internet connection is needed to confirm or cancel a reservation and see current availability or GPS. A disconnected screen cannot confirm a new place."},
 {q:"How do I report an app problem?",a:"Open Profile and select Send feedback for app bugs and suggestions. Use the separate ride/safety reporting option for incidents."},
 {q:"How do I delete my account?",a:"Open Account & security and select Request account deletion, or visit moveapayao.com/delete-account. The page explains verification, processing and retained records."},
];

export const footer = {
  org: "MOVE Apayao",
  province: "Province of Apayao · Cordillera Administrative Region",
  support: "A Project of the Department of Science and Technology.",
  contactLabel: publicContact.supportEmail,
  phoneLabel: publicContact.phone,
};
