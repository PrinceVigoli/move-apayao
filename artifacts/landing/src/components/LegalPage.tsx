import {
  ArrowLeft,
  ExternalLink,
  Mail,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { BrandLockup } from "@/components/Brand";
import { legalVersion, links, publicContact } from "@/content/site";

type LegalKind = "terms" | "privacy";

const lastUpdated = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Manila",
}).format(new Date(`${legalVersion}T00:00:00+08:00`));

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function LegalShell({
  kind,
  children,
}: {
  kind: LegalKind;
  children: ReactNode;
}) {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "Privacy Notice" : "Terms of Service";
  const description = isPrivacy
    ? "How MOVE Apayao collects, uses, shares, retains, and protects personal data."
    : "The rules that apply when passengers and drivers use MOVE Apayao.";

  useEffect(() => {
    document.title = `${title} | MOVE Apayao`;
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute("content", description);
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", `${window.location.origin}/${kind}`);
  }, [description, kind, title]);

  return (
    <div className="legal-page">
      <header className="legal-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a href="/" aria-label="MOVE Apayao home">
            <BrandLockup />
          </a>
          <a href="/" className="button button-secondary button-sm">
            <ArrowLeft size={16} /> Home
          </a>
        </div>
      </header>
      <main>
        <div className="legal-hero">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
            <p className="eyebrow text-primary">Public legal information</p>
            <h1 className="display mt-4 text-4xl sm:text-6xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {description}
            </p>
            <div className="legal-meta mt-7">
              <ShieldCheck size={18} /> Effective and last updated {lastUpdated}{" "}
              · Version {legalVersion}
            </div>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[220px_1fr] lg:py-14">
          <aside className="legal-sidebar" aria-label="Legal navigation">
            <a className={!isPrivacy ? "is-active" : ""} href="/terms">
              Terms of Service
            </a>
            <a className={isPrivacy ? "is-active" : ""} href="/privacy">
              Privacy Notice
            </a>
            <a href="/#contact">Contact</a>
          </aside>
          <article className="legal-card">{children}</article>
        </div>
      </main>
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} MOVE Apayao</p>
          <div className="flex gap-5">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ContactCard({ privacy = false }: { privacy?: boolean }) {
  const email = privacy
    ? publicContact.privacyEmail
    : publicContact.supportEmail;
  return (
    <div className="legal-contact">
      <strong>{privacy ? "Privacy requests" : "Service support"}</strong>
      <p>{publicContact.operator}</p>
      <p className="flex items-start gap-2">
        <MapPin size={16} /> {publicContact.address}
      </p>
      <a href={privacy ? links.privacyEmail : links.email}>
        <Mail size={16} /> {email}
      </a>
      <p>Office availability: {publicContact.hours}</p>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalShell kind="terms">
      <p className="legal-lead">
        These Terms govern the MOVE Apayao passenger app, driver app, website,
        and related transport-dispatch services operated by{" "}
        {publicContact.operator} for the Pudtol pilot.
      </p>
      <Section id="acceptance" title="1. Accepting these Terms">
        <p>
          By creating an account or using the service, you confirm that the
          information you provide is accurate and that you agree to these Terms
          and the <a href="/privacy">Privacy Notice</a>. Do not use the service
          if you do not agree.
        </p>
      </Section>
      <Section id="service" title="2. What the service provides">
        <p>
          MOVE Apayao helps passengers request point-to-point rides, matches
          requests with approved available drivers, provides estimated fares and
          arrival information, and records trip status. The pilot currently uses
          cash payment to the driver.
        </p>
        <p>
          Availability, arrival times, routes, and map estimates can change
          because of connectivity, weather, road conditions, demand, GPS
          accuracy, or driver availability. An estimate is not a guarantee.
        </p>
      </Section>
      <Section id="accounts" title="3. Accounts and eligibility">
        <ul>
          <li>
            Keep your sign-in credentials private and promptly report suspected
            account misuse.
          </li>
          <li>
            Provide a reachable contact method and keep account details current.
          </li>
          <li>
            Do not create fraudulent accounts, impersonate another person, or
            misuse another person’s contact or location data.
          </li>
          <li>
            A parent or legal guardian is responsible for a minor who uses the
            service under their authority.
          </li>
        </ul>
      </Section>
      <Section id="bookings" title="4. Passenger bookings">
        <p>
          Confirm the pickup point, destination, passenger count, and displayed
          fare before requesting a ride. Be ready at a safe pickup location and
          treat the driver, vehicle, and other riders respectfully. Repeated
          no-shows, unsafe conduct, fraud, or misuse may lead to restrictions or
          account suspension after appropriate review.
        </p>
      </Section>
      <Section id="drivers" title="5. Driver responsibilities">
        <p>
          Driver access requires review and approval. Drivers must maintain
          valid licences, vehicle documents, and any permits required by law or
          the pilot program; use only the approved vehicle and account; follow
          traffic and safety rules; protect passenger information; accurately
          update trip status and cash fare collection; and never operate while
          impaired or otherwise unfit.
        </p>
        <p>
          Approval may be revoked or suspended for documented safety,
          eligibility, fraud, or policy concerns. The operations team records
          the reason and provides the review process available under the
          program.
        </p>
      </Section>
      <Section id="location-contact" title="6. Location, calls, and messages">
        <p>
          Location is used for pickup, matching, navigation, trip tracking,
          safety, fleet visibility, and service planning as explained in the
          Privacy Notice. Passenger and driver contact details are exposed only
          when needed for an active ride and must not be retained or used
          afterward for unrelated contact, marketing, harassment, or personal
          purposes.
        </p>
      </Section>
      <Section id="safety" title="7. Safety and emergencies">
        <p>
          Choose a safe place to board or leave the vehicle, use available
          restraints, and follow lawful safety instructions. MOVE Apayao is not
          an emergency-response service. For immediate danger, contact the
          appropriate local emergency service first, then report the incident in
          the app when safe.
        </p>
      </Section>
      <Section id="prohibited" title="8. Prohibited use">
        <p>
          You must not interfere with the app or GPS devices, falsify a location
          or trip, scrape personal data, probe security controls, introduce
          malicious code, threaten or discriminate against another person,
          transport unlawful or dangerous items, or use the service for illegal
          activity.
        </p>
      </Section>
      <Section id="changes" title="9. Changes, suspension, and ending use">
        <p>
          You may stop using the service and request account deactivation. Some
          trip, incident, financial, and audit records may still be kept when
          necessary for safety, legal obligations, dispute handling, or public
          accountability. Material changes to these Terms will be identified by
          a new version and communicated through the app or website before they
          apply when practicable.
        </p>
      </Section>
      <Section id="law" title="10. Applicable law and contact">
        <p>
          These Terms are governed by applicable Philippine law. Concerns should
          first be sent to MOVE Apayao so the operator can investigate and
          document the response; this does not remove any right or remedy
          available under law.
        </p>
        <ContactCard />
      </Section>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell kind="privacy">
      <p className="legal-lead">
        {publicContact.operator} is the personal information controller for the
        MOVE Apayao Pudtol pilot. This notice explains the processing performed
        across the passenger app, driver app, public site, operations dashboard,
        API, GPS and IoT tracking, and support channels.
      </p>
      <Section id="collection" title="1. Personal data we collect">
        <ul>
          <li>
            <strong>Account and contact data:</strong> name, email address,
            phone number, credentials in protected form, role, account status,
            consent version, and notification token.
          </li>
          <li>
            <strong>Driver and vehicle data:</strong> licence number, plate
            number, vehicle type and colour, capacity, application review,
            approval or revocation details, and supporting records supplied for
            verification.
          </li>
          <li>
            <strong>Booking and trip data:</strong> pickup and destination,
            route and stops, passenger count, fare, timestamps, status events,
            driver assignment, ratings, feedback, and cash collection records.
          </li>
          <li>
            <strong>Location and telemetry:</strong> precise passenger location
            while needed for booking or an active trip; smartphone driver
            location while online; and vehicle IoT GPS points, accuracy, speed,
            heading, device state, source, and timestamps.
          </li>
          <li>
            <strong>Safety, support, and technical data:</strong> incident
            reports and attachments, service requests, security and audit
            events, IP and device-related diagnostics, and records needed to
            investigate errors or misuse.
          </li>
        </ul>
      </Section>
      <Section id="purposes" title="2. Why we process it">
        <p>
          We process only data reasonably needed to create and protect accounts;
          verify drivers and vehicles; receive, match, navigate, complete, and
          support rides; calculate and report fares; show live vehicle
          positions; send service notifications; respond to incidents; prevent
          fraud and abuse; maintain auditability; improve route, fleet, and
          transport planning; and meet legal and public-service obligations.
        </p>
        <p>
          The applicable lawful basis may include your consent, steps needed to
          provide the requested service, compliance with law, protection of life
          and safety, performance of a public function, or a legitimate interest
          that does not override your rights. Consent can be withdrawn where
          processing relies on consent, but this does not undo lawful processing
          already performed.
        </p>
      </Section>
      <Section id="sharing" title="3. Who receives data">
        <p>
          Access is limited by role and purpose. A matched passenger and driver
          receive only the trip and contact information needed to complete the
          ride. Authorized operations, safety, finance, and
          system-administration staff receive the minimum information needed for
          their duties.
        </p>
        <p>
          Service providers may process data under appropriate agreements,
          including hosting and database providers, Google Maps Platform for
          maps and routing, Expo services for mobile delivery and notifications,
          and Brevo for transactional email. Data may also be disclosed to
          another government body or lawful authority when authorized or
          required by law. We do not sell personal data.
        </p>
      </Section>
      <Section id="automated" title="4. Matching and analytics">
        <p>
          The service uses location, availability, route compatibility, and
          vehicle capacity to recommend or assign an eligible driver. Operations
          staff retain review and override controls. Aggregated or de-identified
          trip and GPS patterns may be used for route proposals, demand
          forecasting, fleet planning, safety analysis, and public-service
          reports; candidate GIS routes do not become published routes without
          authorized human review.
        </p>
      </Section>
      <Section id="retention" title="5. Retention and deletion">
        <p>
          Data is kept only for as long as needed for the declared purpose and
          the LGU’s approved records-retention, audit, safety, dispute, and
          legal requirements. Retention varies by record: live operational cache
          data is short-lived; account data is kept while the account is active;
          and trip, incident, financial, approval, security, and government
          records may need longer retention. At the end of the applicable
          period, records are securely deleted, anonymized, or archived as
          required by law.
        </p>
        <p>
          A deactivated account is not the same as immediate deletion. You may
          request erasure or blocking, and the operator will explain any record
          that must lawfully be retained.
        </p>
      </Section>
      <Section id="security" title="6. Security and location controls">
        <p>
          MOVE Apayao uses role-based access, protected authentication,
          encrypted network connections in deployment, audit logs, restricted
          infrastructure access, and monitoring appropriate to the data and
          risk. No system can promise absolute security; suspected privacy or
          security incidents are investigated and notified as required by
          applicable law.
        </p>
        <p>
          Passenger location is requested for booking and active-trip features.
          Driver smartphone background location may continue while the driver is
          online or on a trip. A vehicle IoT unit can upload stored points after
          connectivity returns. Device permissions can be changed in system
          settings, but disabling required location access can prevent matching
          or live-tracking features.
        </p>
      </Section>
      <Section id="rights" title="7. Your privacy rights">
        <p>
          Subject to the Data Privacy Act of 2012 and its implementing rules,
          you may ask to be informed, access your data, object to processing,
          correct inaccurate data, request erasure or blocking, obtain portable
          data where applicable, claim damages, and file a complaint with the
          National Privacy Commission. We may verify identity before acting on a
          request to protect the account.
        </p>
        <p>
          Read the official{" "}
          <a
            href="https://privacy.gov.ph/data-privacy-act/"
            target="_blank"
            rel="noreferrer"
          >
            Data Privacy Act <ExternalLink size={14} />
          </a>{" "}
          and the National Privacy Commission guidance on{" "}
          <a
            href="https://privacy.gov.ph/data-subject-rights/"
            target="_blank"
            rel="noreferrer"
          >
            data-subject rights <ExternalLink size={14} />
          </a>
          .
        </p>
      </Section>
      <Section id="contact" title="8. Exercise your rights or ask a question">
        <p>
          Send a request with your name, account email or phone, the right you
          want to exercise, and enough detail to locate the relevant record. Do
          not email passwords, one-time codes, or unnecessary identity
          documents. The privacy contact will acknowledge, verify, and handle
          the request under the operator’s privacy procedure.
        </p>
        <ContactCard privacy />
      </Section>
      <Section id="updates" title="9. Updates to this notice">
        <p>
          Material changes will be shown by a new version and effective date
          and, when appropriate, communicated in the apps or by another
          available contact channel. A privacy notice provides transparency; it
          is not a substitute for consent where the law specifically requires
          consent.
        </p>
      </Section>
    </LegalShell>
  );
}
