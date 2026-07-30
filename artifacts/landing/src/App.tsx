import { Nav, Hero, HowItWorks } from '@/components/Top';
import {
  Coverage,
  Features,
  Drivers,
  Stakeholders,
  Faq,
  Footer,
} from '@/components/Body';
import { RouteRule } from '@/components/RouteStrip';

export default function App() {
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
        <RouteRule />
        <Coverage />
        <Features />
        <Drivers />
        <Stakeholders />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
