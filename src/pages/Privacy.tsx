import { Spade } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="relative w-12 h-12">
            <span className="text-[2rem] font-bold text-[#1a1f36] leading-none">P</span>
            <Spade className="w-3.5 h-3.5 text-[#1a1f36] absolute bottom-1 right-0.5" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-[#1a1f36] mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: March 2026</p>

        <Section title="Who we are">
          Pique is a puzzle game platform available at piquepuzzles.lovable.app, operated by Conor Murray. You can contact us at conor-murray@hotmail.com.
        </Section>

        <Section title="What we collect and why">
          <P><strong>Account information:</strong> When you sign in with Google, we receive your name and email address. We use this to create and manage your account, identify you across sessions, and contact you about your account if necessary.</P>
          <P><strong>Game data:</strong> We record your game history, Puzzle IQ rating, win/loss record, move counts, time per game, hints used, and streak data. We use this to calculate your rating, show you your progress, and improve deal difficulty calibration across the player base.</P>
          <P><strong>Device and usage data:</strong> We collect basic usage events — games started, games completed, features used — to understand how the app is being used and improve it. We do not collect device identifiers or precise location.</P>
          <P><strong>Push notification tokens:</strong> If you grant notification permission, we store your device's push token to send you daily challenge reminders and streak alerts. You can revoke this at any time in your device settings.</P>
          <P><strong>Payment information:</strong> If you subscribe to Pique Premium, payments are processed by Stripe. We do not store your card details — Stripe handles all payment data under their own privacy policy.</P>
        </Section>

        <Section title="Who we share your data with">
          We use the following third-party services to operate Pique: Supabase (database and authentication infrastructure, EU-based servers), Google (sign-in authentication via OAuth), Stripe (payment processing for Premium subscriptions), Google AdMob (advertising for free tier users), and Firebase by Google (push notification delivery). We do not sell your data. We do not share your data with any other third parties.
        </Section>

        <Section title="Advertising">
          Free tier users see ads served by Google AdMob. AdMob may use cookies and device identifiers to serve personalised ads based on your interests. On your first use of the app, you will be asked whether you consent to personalised ads. You can choose non-personalised ads instead — you will still see ads but they will not be based on your interests. For more information on how Google uses data in advertising, visit{' '}
          <a href="https://policies.google.com/privacy/partners" target="_blank" rel="noopener noreferrer" className="text-[#1a1f36] underline hover:opacity-70">google.com/policies/privacy/partners</a>.
        </Section>

        <Section title="Data retention">
          We retain your account and game data for as long as your account is active. If you request account deletion, we will delete your personal data within 30 days. Game data that has been anonymised and aggregated into difficulty statistics may be retained indefinitely.
        </Section>

        <Section title="Your rights">
          Under GDPR, if you are based in the EU or UK, you have the right to: access the personal data we hold about you, correct inaccurate data, request deletion of your data, object to processing of your data, and request a copy of your data in a portable format. To exercise any of these rights, email us at conor-murray@hotmail.com. We will respond within 30 days.
        </Section>

        <Section title="Children">
          Pique is not directed at children under 13. We do not knowingly collect data from children under 13. If you believe a child has provided us with personal data, please contact us and we will delete it promptly.
        </Section>

        <Section title="Changes to this policy">
          We may update this policy as the app evolves. We will notify you of material changes via email or an in-app notice. The date at the top of this page reflects the most recent revision.
        </Section>

        <Section title="Contact">
          For any privacy questions or data requests: <a href="mailto:conor-murray@hotmail.com" className="text-[#1a1f36] underline hover:opacity-70">conor-murray@hotmail.com</a>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-[#1a1f36] mb-3">{title}</h2>
      <div className="text-gray-600 leading-relaxed text-[15px] space-y-3">{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}
