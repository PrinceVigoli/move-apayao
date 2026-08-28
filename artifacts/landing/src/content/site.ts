const value = (input: string | undefined) => input?.trim() ?? "";
const emailLink = (email: string, subject?: string) =>
  `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;

export const legalVersion = "2026-08-27";

export const publicContact = {
  operator:
    value(import.meta.env.VITE_SERVICE_OPERATOR) ||
    "Municipal Government of Pudtol",
  supportEmail:
    value(import.meta.env.VITE_SUPPORT_EMAIL) || "lgupudtol1@gmail.com",
  privacyEmail:
    value(import.meta.env.VITE_PRIVACY_EMAIL) ||
    value(import.meta.env.VITE_SUPPORT_EMAIL) ||
    "lgupudtol1@gmail.com",
  phone: value(import.meta.env.VITE_SUPPORT_PHONE),
  address:
    value(import.meta.env.VITE_OFFICE_ADDRESS) ||
    "Pudtol Municipal Hall, Poblacion, Pudtol, Apayao 3812",
  hours:
    value(import.meta.env.VITE_SUPPORT_HOURS) ||
    "Monday to Friday, during government office hours",
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
  officialWebsite: "https://lgupudtol.ph/",
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
  eyebrow: "Pudtol · Apayao",
  title: "E-trike rides you can actually track.",
  body: "Book a ride from your barangay, watch your driver come to you on the map, and pay the fare in cash when you arrive.",
  primaryCta: "Get the app",
  secondaryCta: "Drive with us",
  note: "Free to download. No account fees.",
};

/* sequence of steps for the "How it works" section on the landing page */
export const steps = [
  {
    n: "01",
    title: "Set where you are going",
    body: "Tap the map or search for a place. Say how many of you are riding — the app only matches vehicles with enough seats.",
  },
  {
    n: "02",
    title: "Get matched to the nearest driver",
    body: "The nearest available e-trike with room for your group is assigned automatically. If nobody is free, the app keeps looking and tells you either way.",
  },
  {
    n: "03",
    title: "Watch them approach",
    body: "Your driver moves on the map in real time, so you know whether to wait inside or step out to the road.",
  },
  {
    n: "04",
    title: "Pay cash, then rate the ride",
    body: "Hand the fare to your driver at drop-off. Rate the trip afterwards so the service keeps improving.",
  },
];

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

export const coverage = {
  eyebrow: "Where we run",
  title: "One loop today. More as the fleet grows.",
  body: "MOVE Apayao is starting small and on purpose. The pilot runs a single loop through Pudtol so we can prove the service works — arrival times, driver availability, fare reporting — before adding routes.",
  stats: [
    { value: "Pudtol", label: "Pilot service area" },
    { value: "Cash", label: "Fare collection" },
    { value: "Live", label: "GPS trip tracking" },
  ],
  caveat:
    "Coverage is expanding. If your barangay is not on the loop yet, tell us — requests help the LGU decide which route comes next.",
};

export const features = [
  {
    icon: "MapPin",
    title: "Live driver tracking",
    body: "See your assigned driver move on the map from the moment you are matched until you are dropped off.",
  },
  {
    icon: "Users",
    title: "Group booking",
    body: "Riding with family? Set the number of passengers and only vehicles with enough seats will be matched.",
  },
  {
    icon: "History",
    title: "Trip history",
    body: "Every ride you take is saved with its route, distance and fare, so you can check what you paid.",
  },
  {
    icon: "CloudRain",
    title: "Weather-aware",
    body: "Current conditions are shown in the app, which matters during the rainy season on mountain roads.",
  },
  {
    icon: "TriangleAlert",
    title: "Report a problem",
    body: "Flag a road accident, a flooded section or a vehicle issue from your phone. Reports are location-tagged for the LGU.",
  },
  {
    icon: "Star",
    title: "Driver ratings",
    body: "Rate each trip and leave a comment. Ratings are visible to the operations team, not just averaged away.",
  },
];

/* ------------------------------------------------------------------ */
/* Drivers                                                             */
/* ------------------------------------------------------------------ */

export const drivers = {
  eyebrow: "For drivers",
  title: "Get passengers without waiting at the terminal.",
  body: "Sign up once with your vehicle and licence details. Go online when you want to work, accept the rides that come to you, and see what you earned at the end of the day.",
  points: [
    "Ride requests come to your phone — no queuing for passengers",
    "Turn-by-turn navigation to pickup and drop-off",
    "Daily and 30-day earnings, counted per completed trip",
    "You collect the fare in cash, directly from the passenger",
  ],
  cta: "Download the driver app",
  note: "The driver app is a separate download from the passenger app.",
};

export const stakeholders = {
  eyebrow: "For the LGU and partners",
  title: "Every trip is a record you can report on.",
  body: "MOVE Apayao was built for Pudtol with support from DOST. Operations staff get an admin dashboard covering the whole service, so ridership and revenue reporting come from the system itself rather than a separate spreadsheet.",
  items: [
    {
      title: "Daily ridership and revenue",
      body: "Trips per day, trip duration, passengers carried and fares collected, charted over any date range and exportable as CSV.",
    },
    {
      title: "Live fleet map",
      body: "Every registered driver on one map — available, on a trip, or offline — with how long ago each was last seen.",
    },
    {
      title: "Safety and incident log",
      body: "Accident, flood and vehicle reports from riders and drivers, location-tagged and timestamped.",
    },
    {
      title: "Rider feedback",
      body: "Star ratings and written comments attached to the specific trip and driver they describe.",
    },
  ],
};

export const faqs = [
  {
    q: "How do I pay?",
    a: "Cash, handed to your driver at drop-off. The app shows the fare before you book so there are no surprises. We are not accepting in-app payments or transport cards yet.",
  },
  {
    q: "How much does a ride cost?",
    a: "The fare is calculated from the distance and the number of passengers, and is shown in the app before you confirm the booking.",
  },
  {
    q: "Which areas are covered?",
    a: "The pilot covers Pudtol. If no driver is available near you, the app keeps searching for a few minutes and then tells you plainly instead of leaving you waiting.",
  },
  {
    q: "Do I need mobile data the whole time?",
    a: "You need a connection to book and to watch your driver approach. Coverage in parts of Apayao is patchy, so if the map stops updating, your driver is still on the way — call them directly.",
  },
  {
    q: "What if something goes wrong during a trip?",
    a: 'Use "Report an Issue" in the app to log an accident, a flooded road or a vehicle problem. Your location is attached so the operations team knows where it happened.',
  },
  {
    q: "What do you do with my location data?",
    a: "Location is used to match you with a nearby driver and to show your trip in progress. Trip records are kept so the LGU can report on ridership and follow up on incidents.",
  },
  {
    q: "How do I drive for MOVE Apayao?",
    a: "Download the driver app and register with your vehicle type, plate number and licence details. Registrations are reviewed by the operations team.",
  },
];

export const footer = {
  org: "MOVE Apayao",
  province: "Province of Apayao · Cordillera Administrative Region",
  support: "A Project of the Department of Science and Technology.",
  contactLabel: publicContact.supportEmail,
  phoneLabel: publicContact.phone,
};
