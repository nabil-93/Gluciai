import React from 'react';
import { useTranslation } from 'react-i18next';

import { LockedScreen } from '@/components/ui';

/**
 * Subscription screen — reached from the profile "Abonnement" row.
 * Shows the free-plan message + WhatsApp support CTA (LockedScreen plan
 * variant), so the patient knows how to upgrade / contact support.
 */
export default function SubscriptionScreen() {
  const { t } = useTranslation();
  return <LockedScreen featureLabel={t('locked.planFeature')} variant="plan" />;
}
