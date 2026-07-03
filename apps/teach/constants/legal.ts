// Single source of truth for the in-app legal documents. The website
// (apps/website/app/{privacy,terms}) carries the same text — keep them in
// sync when either changes, and bump `updated` on every edit.
//
// NOTE: drafted in-house; have counsel review before store submission
// (see docs/launch-ops.md → Pre-launch).

export type LegalSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  title: string;
  updated: string;
  sections: LegalSection[];
};

export const LEGAL_CONTACT_EMAIL = "hello@scheduhq.com";
export const LEGAL_WEBSITE_URL = "https://www.scheduhq.com";
export const PRIVACY_URL = "https://www.scheduhq.com/privacy";
export const TERMS_URL = "https://www.scheduhq.com/terms";

export const PRIVACY_POLICY: LegalDoc = {
  title: "Privacy Policy",
  updated: "July 3, 2026",
  sections: [
    {
      paragraphs: [
        "SchEDU (\"SchEDU\", \"we\", \"us\") is a lesson-planning and scheduling companion for teachers. This Privacy Policy explains what information we collect through the SchEDU app and our websites (scheduhq.com and teach.scheduhq.com), how we use it, and the choices you have.",
        "We handle personal information in line with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules. By using SchEDU, you agree to the practices described in this policy.",
      ],
    },
    {
      heading: "Information we collect",
      bullets: [
        "Account information — your name, email address, username, and password credentials when you create an account (passwords are stored only in hashed form by our authentication provider, never in plain text).",
        "Profile and school details — optional information you add, such as your institution and role.",
        "Content you create — subjects, lessons, lesson plans, schedules, sections, activities, exams, and any files or templates you upload.",
        "Subscription and billing records — your plan, subscription status, and billing history. Card and e-wallet details are collected and processed directly by our payment providers (PayMongo in the Philippines, Stripe internationally); we never see or store your full payment credentials.",
        "Usage and device data — basic information about how the app is used, your device type and operating system, and crash and error reports that help us fix problems.",
        "Early-access signups — the email address you submit on our website to be notified about SchEDU.",
      ],
    },
    {
      heading: "How we use your information",
      bullets: [
        "To provide SchEDU: build your term schedules, track your lessons and sections, and sync your content across sessions.",
        "To generate materials you request: when you use automated activity or exam creation, the relevant lesson content is processed to draft those materials for you.",
        "To manage subscriptions, process payments, and send billing notices.",
        "To respond to support requests and send important service messages (such as changes to these policies).",
        "To understand how SchEDU is used, improve it, and keep it secure — including detecting abuse and fraud.",
      ],
      paragraphs: [
        "We do not use your lesson content for advertising, and we do not sell your personal information to anyone.",
      ],
    },
    {
      heading: "AI-assisted features",
      paragraphs: [
        "SchEDU's automated lesson-to-activity and exam generation may send the lesson content you select to trusted AI service providers, solely to produce the materials you requested. The output is returned to you and stored in your library like any other content you create. Always review generated materials before using them in class.",
      ],
    },
    {
      heading: "Who we share information with",
      paragraphs: [
        "We share personal information only with service providers that help us run SchEDU — such as our hosting and database provider, payment processors (PayMongo and Stripe), error-monitoring service, and AI service providers — and only to the extent needed for them to perform their services for us.",
        "We may also disclose information if required by law or a lawful government request, to protect the rights and safety of our users, or as part of a merger, acquisition, or sale of assets (in which case this policy will continue to apply to your information).",
      ],
    },
    {
      heading: "Data retention and deletion",
      paragraphs: [
        "We keep your information for as long as your account is active. You can delete your account at any time from Settings → Delete Account, which permanently removes your account and the content associated with it. You can also email us to request deletion. Residual copies may persist in encrypted backups for a limited period before being purged, and we may retain records we are legally required to keep (such as billing records).",
      ],
    },
    {
      heading: "Security",
      paragraphs: [
        "Your data is encrypted in transit, access to it is restricted by per-user access controls at the database level, and payment credentials are handled entirely by our payment providers. No system is perfectly secure, but we work to protect your information and will notify you and the National Privacy Commission of any breach as required by law.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Under the Data Privacy Act, you have the right to be informed about, access, correct, and object to the processing of your personal data, to have it erased or blocked, to data portability, and to be indemnified for damages. You may also lodge a complaint with the National Privacy Commission (privacy.gov.ph).",
        "To exercise any of these rights, email us at hello@scheduhq.com. You can unsubscribe from launch and marketing emails using the link in any message we send.",
      ],
    },
    {
      heading: "Children",
      paragraphs: [
        "SchEDU is built for teachers and other education professionals. It is not directed at children, and we do not knowingly collect personal information from anyone under 18. SchEDU accounts do not require you to enter your students' personal information, and we ask that you do not include it in your content.",
      ],
    },
    {
      heading: "International transfers",
      paragraphs: [
        "Our service providers may store and process data on servers located outside the Philippines. Wherever your data is processed, it remains protected under this policy and applicable law.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "We may update this policy as SchEDU evolves. If we make material changes, we will notify you in the app or by email before they take effect. The \"Last updated\" date above always reflects the current version.",
      ],
    },
    {
      heading: "Contact us",
      paragraphs: [
        "Questions about your privacy or this policy? Email hello@scheduhq.com.",
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  title: "Terms of Service",
  updated: "July 3, 2026",
  sections: [
    {
      paragraphs: [
        "These Terms of Service (\"Terms\") govern your use of the SchEDU app and websites (scheduhq.com and teach.scheduhq.com), operated by SchEDU (\"we\", \"us\"). By creating an account or using SchEDU, you agree to these Terms and to our Privacy Policy. If you do not agree, please do not use SchEDU.",
        "You must be at least 18 years old (or the age of majority where you live) to use SchEDU.",
      ],
    },
    {
      heading: "The service",
      paragraphs: [
        "SchEDU is a planning companion for teachers: it builds term schedules from your subjects and class times, tracks lessons across sections, and helps turn lessons into classroom activities and exams. Features may change as we improve the product; we will not materially reduce what a paid plan includes during a period you have already paid for.",
      ],
    },
    {
      heading: "Your account",
      paragraphs: [
        "You are responsible for keeping your login credentials secure and for all activity under your account. Provide accurate information when you sign up and keep it up to date. Notify us promptly at hello@scheduhq.com if you believe your account has been compromised.",
      ],
    },
    {
      heading: "Plans, billing, and cancellation",
      bullets: [
        "SchEDU offers a Free plan and paid PRO and MAX subscriptions, each with usage limits (lesson plans, subjects, and daily automated activity/exam generations) described at purchase.",
        "Paid plans are billed monthly in advance through PayMongo (Philippines) or by card internationally, and renew automatically each month until cancelled.",
        "You can cancel anytime; your paid features remain active until the end of the current billing period, after which your account moves to the Free plan. Amounts already paid for a started billing period are not refunded except where the law requires.",
        "We may change prices or plan limits with at least 30 days' notice; changes take effect at your next renewal.",
      ],
    },
    {
      heading: "Your content",
      paragraphs: [
        "You own the subjects, lessons, plans, activities, and other content you create or upload in SchEDU. You grant us a limited license to host, process, back up, and display that content solely to operate and improve the service — including generating the schedules and materials you request.",
        "You are responsible for your content. Do not upload material you do not have the right to use, and do not include students' personal information in your content.",
      ],
    },
    {
      heading: "AI-generated materials",
      paragraphs: [
        "Automatically generated schedules, activities, and exams are drafts. They can contain mistakes, and they are not guaranteed to satisfy your school's or the Department of Education's requirements. Review and edit generated materials before using them with students — you are responsible for what you ultimately teach and hand out.",
      ],
    },
    {
      heading: "Acceptable use",
      bullets: [
        "Use SchEDU only for lawful purposes.",
        "Do not attempt to breach, probe, or disrupt the service, access other users' data, or circumvent plan limits (for example by sharing accounts or automating requests).",
        "Do not resell, scrape, or copy the service, or reverse-engineer it except where the law permits.",
      ],
    },
    {
      heading: "Our intellectual property",
      paragraphs: [
        "The SchEDU app, websites, branding, and everything in them (other than your content) belong to us or our licensors. These Terms do not give you any right to use our trademarks or a license to anything beyond using the service as intended.",
      ],
    },
    {
      heading: "Termination",
      paragraphs: [
        "You may stop using SchEDU or delete your account at any time from Settings. We may suspend or terminate accounts that violate these Terms, that we are required to close by law, or after extended inactivity on the Free plan — with notice where practicable. Sections that by their nature should survive (such as ownership, disclaimers, and limitation of liability) survive termination.",
      ],
    },
    {
      heading: "Disclaimers",
      paragraphs: [
        "SchEDU is provided \"as is\" and \"as available\". We work hard to keep it reliable, but we do not guarantee that it will be uninterrupted, error-free, or that generated content will be accurate or fit for a particular purpose. SchEDU is a planning aid — it is not an official school record, grading system, or system of record for your institution.",
      ],
    },
    {
      heading: "Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law, we are not liable for indirect, incidental, special, or consequential damages, or for loss of data, profits, or goodwill, arising from your use of SchEDU. Our total liability for any claim is limited to the amount you paid us in the 12 months before the claim arose (or ₱1,000 if you have paid nothing). Nothing in these Terms limits liability that cannot be limited under applicable law.",
      ],
    },
    {
      heading: "Governing law",
      paragraphs: [
        "These Terms are governed by the laws of the Republic of the Philippines. Disputes will be brought in the competent courts of the Philippines, without prejudice to any mandatory consumer rights you have where you live.",
      ],
    },
    {
      heading: "Changes to these Terms",
      paragraphs: [
        "We may update these Terms as SchEDU evolves. If we make material changes, we will notify you in the app or by email before they take effect. Continuing to use SchEDU after changes take effect means you accept the updated Terms.",
      ],
    },
    {
      heading: "Contact us",
      paragraphs: [
        "Questions about these Terms? Email hello@scheduhq.com.",
      ],
    },
  ],
};
