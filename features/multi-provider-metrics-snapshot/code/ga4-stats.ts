// -----------------------------------------------------------------------
//  GA4 campaign performance (GATED).
//  Representative "not yet configured" adapter: returns null until GA4 is
//  actually wired up. The wiring lives here so the daily snapshot + hub
//  light up automatically once you add:
//    - GA4_PROPERTY_ID
//    - GA4_SERVICE_ACCOUNT_JSON (service-account key) or GOOGLE_APPLICATION_CREDENTIALS
//  and the @google-analytics/data dependency. Until then this is a no-op so we
//  don't pull in an uninstalled dependency or fail the build.
// -----------------------------------------------------------------------

export interface Ga4CampaignStats {
  totalUsers: number;
  conversions: number;
  byCampaign: { campaign: string; users: number; conversions: number }[];
}

export async function fetchGa4CampaignStats(): Promise<Ga4CampaignStats | null> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const creds = process.env.GA4_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!propertyId || !creds) return null; // not configured yet

  // TODO: implement with @google-analytics/data BetaAnalyticsDataClient once the
  // dependency is installed and credentials are present. Group by
  // sessionCampaignName, return users + key conversions per campaign.
  return null;
}
