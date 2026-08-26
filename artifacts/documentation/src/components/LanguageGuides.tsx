import { CheckCircle2, Languages } from "lucide-react";
import { useState } from "react";

type Language = "English" | "Filipino" | "Ilocano";

const guides: Record<Language, { passenger: string[]; driver: string[]; emergency: string }> = {
  English: {
    passenger: ["Create your account and verify your contact details.", "Choose an approved pickup and destination.", "Review the fare, then confirm only one booking.", "Wait for the assigned vehicle and share the pickup PIN only when boarding.", "Rate the completed ride and report safety concerns."],
    driver: ["Use an approved driver account and start your shift.", "Review passenger count and pickup before accepting.", "Follow the approved road route and mark arrival.", "Verify the passenger pickup PIN before starting.", "Complete the trip, collect the displayed fare, and end the shift when finished."],
    emergency: "For immediate danger, contact local emergency services first, then file an incident report in MOVE Apayao.",
  },
  Filipino: {
    passenger: ["Gumawa ng account at tiyaking tama ang iyong contact details.", "Pumili ng aprubadong pickup at destinasyon.", "Suriin ang pamasahe bago kumpirmahin ang isang booking lamang.", "Hintayin ang nakatalagang sasakyan at ibigay lamang ang pickup PIN kapag sasakay na.", "Magbigay ng rating pagkatapos ng biyahe at i-report ang anumang usaping pangkaligtasan."],
    driver: ["Gamitin ang aprubadong driver account at simulan ang shift.", "Suriin ang bilang ng pasahero at pickup bago tanggapin ang biyahe.", "Sundin ang aprubadong ruta at markahang arrived kapag nasa pickup na.", "I-verify ang pickup PIN ng pasahero bago simulan ang biyahe.", "Kumpletuhin ang trip, kolektahin ang nakasaad na pamasahe, at tapusin ang shift kapag tapos na."],
    emergency: "Kung may agarang panganib, tumawag muna sa lokal na emergency service, saka gumawa ng incident report sa MOVE Apayao.",
  },
  Ilocano: {
    passenger: ["Mangaramid ti account ken siguraduen a husto dagiti contact detail.", "Pilien ti naaprubaran a pagsakayan ken papanan.", "Kitaen ti plete sakbay a kumpirmaen ti maymaysa laeng a booking.", "Urayen ti naituding a lugan ken ibaga laeng ti pickup PIN no sumakaykan.", "Mangted ti rating kalpasan ti byahe ken ireport ti aniaman a pakaseknan iti kinatalged."],
    driver: ["Usaren ti naaprubaran a driver account ken rugian ti shift.", "Kitaen ti bilang dagiti pasahero ken pickup sakbay nga awaten ti byahe.", "Suroten ti naaprubaran a ruta ken markaan nga arrived no adda kan iti pickup.", "Pasingkedan ti pickup PIN ti pasahero sakbay a rugian ti byahe.", "Kompletoen ti trip, kolektaen ti naipakita a plete, ken ileppas ti shift no nalpasen."],
    emergency: "No adda dagus a peggad, awagan nga umuna ti lokal nga emergency service, kalpasanna mangaramid ti incident report iti MOVE Apayao.",
  },
};

export function LanguageGuides() {
  const [language, setLanguage] = useState<Language>("English");
  const guide = guides[language];
  return <div className="language-guides">
    <div className="language-tabs" role="tablist" aria-label="Quick-guide language">{(Object.keys(guides) as Language[]).map((item) => <button type="button" role="tab" aria-selected={language === item} className={language === item ? "active" : ""} onClick={() => setLanguage(item)} key={item}><Languages size={16} />{item}</button>)}</div>
    <div className="translated-grid">
      <article><p>Passenger quick guide</p><h2>{language === "English" ? "Book and ride safely" : language === "Filipino" ? "Mag-book at bumiyahe nang ligtas" : "Ag-book ken agbiahe a sitatalged"}</h2><ol>{guide.passenger.map((step) => <li key={step}><CheckCircle2 size={17} />{step}</li>)}</ol></article>
      <article><p>Driver quick guide</p><h2>{language === "English" ? "Operate an approved trip" : language === "Filipino" ? "Pamahalaan ang aprubadong biyahe" : "Imaneho ti naaprubaran a byahe"}</h2><ol>{guide.driver.map((step) => <li key={step}><CheckCircle2 size={17} />{step}</li>)}</ol></article>
    </div>
    <aside className="callout warning"><strong>Emergency guidance</strong><p>{guide.emergency}</p></aside>
    <p className="translation-review">Filipino and Ilocano operational wording should receive final review from the LGU’s designated native-language reviewer before a formal public launch.</p>
  </div>;
}
