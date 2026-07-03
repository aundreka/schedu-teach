import LegalScreen from "../../components/LegalScreen";
import { TERMS_OF_SERVICE } from "../../constants/legal";

export default function TermsOfService() {
  return <LegalScreen doc={TERMS_OF_SERVICE} />;
}
