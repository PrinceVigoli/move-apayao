export const INTERNAL_RUNBOOKS_VERSION = "1.1.0";
export const INTERNAL_RUNBOOKS_UPDATED_AT = "2026-08-26";

export type InternalRunbook = {
  id: string;
  title: string;
  purpose: string;
  steps: string[];
  escalation: string;
};

export const internalRunbooks: InternalRunbook[] = [
  {
    id: "incident-response",
    title: "Security incident response",
    purpose: "Contain suspected account, credential, data, or infrastructure compromise while preserving evidence.",
    steps: [
      "Record the detection time, reporter, affected service, and observable symptoms without copying secrets into chat or tickets.",
      "Disable or revoke the narrowest affected account, API key, device credential, or session set; do not erase logs or database records.",
      "Preserve API, audit, hosting, database, and device logs with timestamps and access controls.",
      "Rotate exposed credentials, verify exact allowed origins and key restrictions, then test the affected workflow.",
      "Document impact, corrective action, owner, and prevention work before formally closing the incident.",
    ],
    escalation: "Notify the superadmin and designated LGU incident owner immediately for personal-data exposure, unauthorized privileged access, or service-wide compromise.",
  },
  {
    id: "deployment-rollback",
    title: "Deployment and rollback",
    purpose: "Release API and client changes with a tested recovery path and compatible database state.",
    steps: [
      "Confirm CI typecheck, tests, production builds, reviewed migrations, and environment-variable inventory.",
      "Back up the production database and record the current application revision before migration or deployment.",
      "Deploy the API first when clients depend on backward-compatible endpoints, then deploy static sites and mobile updates.",
      "Check /api/livez, /api/healthz, sign-in, one test booking, dispatch, tracking, SMTP, and audit recording.",
      "If acceptance checks fail, stop rollout, restore the previous application revision, and apply only a reviewed database recovery procedure.",
    ],
    escalation: "Escalate any destructive migration or incompatible rollback decision to the database owner and superadmin; never improvise a production schema reset.",
  },
  {
    id: "backup-restore",
    title: "Database backup and restore drill",
    purpose: "Prove that Postgres/PostGIS operational and spatial records can be recovered within the pilot recovery objective.",
    steps: [
      "Confirm automated backups are encrypted, retained, and stored outside the running application host.",
      "Restore the latest backup into an isolated non-production database using separate credentials.",
      "Validate user counts, active route geometry, fare policy, driver approvals, trips, audit logs, and GIS trace integrity.",
      "Run API smoke checks against the isolated restore without sending real notifications or device commands.",
      "Record recovery time, missing data interval, validation results, and required corrective work.",
    ],
    escalation: "Treat any failed restore, missing audit history, or spatial-data corruption as a release blocker until corrected and retested.",
  },
  {
    id: "credential-rotation",
    title: "Credential rotation",
    purpose: "Replace sensitive credentials without leaving old keys valid or causing an uncontrolled outage.",
    steps: [
      "Inventory the exact consumer and restriction for the JWT, database, Redis, GIS, SMTP, Google, EAS, or device credential.",
      "Create the replacement in the provider secret store and apply the narrowest platform, API, referrer, network, or role restriction.",
      "Deploy the replacement to its authorized consumers and complete a focused functional test.",
      "Revoke the previous credential, verify that it no longer works, and review logs for unexpected use.",
      "Record the rotation date, owner, affected services, and next scheduled review without recording the secret value.",
    ],
    escalation: "Rotate immediately when a value appears in source control, screenshots, chat, logs, or an unauthorized device.",
  },
  {
    id: "gis-iot-quality",
    title: "GIS and IoT telemetry quality",
    purpose: "Investigate missing, delayed, duplicated, or implausible vehicle locations without publishing unsafe route changes.",
    steps: [
      "Compare device timestamp, received timestamp, accuracy, speed, sequence, assignment, and smartphone telemetry for the same vehicle.",
      "Check SIM connectivity, tracker buffering, device clock drift, credential status, and replay or duplicate rejection logs.",
      "Quarantine low-quality points from route analysis while retaining the raw evidence according to policy.",
      "Run route analysis only after the multi-run and multi-driver thresholds are satisfied.",
      "Require developer or superadmin review before a candidate becomes a published route.",
    ],
    escalation: "Escalate persistent vehicle identity conflicts, impossible movement, or unexplained credential use as a potential provisioning or security incident.",
  },
];
