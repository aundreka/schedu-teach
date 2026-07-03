import LegalScreen from "../../components/LegalScreen";
import { PRIVACY_POLICY } from "../../constants/legal";

export default function PrivacyPolicy() {
  return <LegalScreen doc={PRIVACY_POLICY} />;
}
