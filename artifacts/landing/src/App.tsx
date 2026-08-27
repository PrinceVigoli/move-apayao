import { Nav, Hero, HowItWorks } from "@/components/Top";
import {
  Coverage,
  Features,
  Drivers,
  Stakeholders,
  Faq,
  Contact,
  Footer,
} from "@/components/Body";
import { ResetPassword } from "@/components/ResetPassword";
import { PrivacyPage, TermsPage } from "@/components/LegalPage";

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/reset-password") {
    return <ResetPassword />;
  }
  if (pathname === "/terms") return <TermsPage />;
  if (pathname === "/privacy") return <PrivacyPage />;

  return (
    <>
      <a
        href="#how"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Coverage />
        <Features />
        <Drivers />
        <Stakeholders />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
