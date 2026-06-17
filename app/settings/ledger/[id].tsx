import { Redirect } from 'expo-router';

export default function LegacyLedgerDetailRedirect() {
  return <Redirect href="/settings/ledgers" />;
}
