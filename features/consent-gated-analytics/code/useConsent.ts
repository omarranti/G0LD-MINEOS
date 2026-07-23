'use client';

import { useState, useEffect } from 'react';

export interface ConsentData {
  consentId: string;
  userId?: string;
  sessionId: string;
  consentType: 'session' | 'anonymous' | 'account';
  acceptedAt: string;
  dataRetentionDays?: number;
}

export interface ConsentState {
  hasConsented: boolean;
  consentType?: 'session' | 'anonymous' | 'account';
  consentId?: string;
  dataRetentionDays?: number;
}

export const useConsent = (sessionId: string) => {
  const [consentState, setConsentState] = useState<ConsentState>({
    hasConsented: false
  });
  const [showConsentModal, setShowConsentModal] = useState(false);

  useEffect(() => {
    // Check for existing consent in session storage
    const existingConsent = sessionStorage.getItem('therma-consent');
    if (existingConsent) {
      try {
        const consent = JSON.parse(existingConsent) as ConsentData;
        setConsentState({
          hasConsented: true,
          consentType: consent.consentType,
          consentId: consent.consentId,
          dataRetentionDays: consent.dataRetentionDays
        });
      } catch (error) {
        console.error('Error parsing consent data:', error);
      }
    } else {
      // Show consent modal on first interaction
      setShowConsentModal(true);
    }
  }, [sessionId]);

  const createConsent = async (consentType: 'session' | 'anonymous' | 'account', dataRetentionDays?: number) => {
    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          consentType,
          dataRetentionDays: dataRetentionDays || getDefaultRetentionDays(consentType)
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create consent');
      }

      const consentData: ConsentData = await response.json();
      
      // Store in session storage
      sessionStorage.setItem('therma-consent', JSON.stringify(consentData));
      
      setConsentState({
        hasConsented: true,
        consentType: consentData.consentType,
        consentId: consentData.consentId,
        dataRetentionDays: consentData.dataRetentionDays
      });
      
      setShowConsentModal(false);
      return consentData;
    } catch (error) {
      console.error('Error creating consent:', error);
      throw error;
    }
  };

  const getDefaultRetentionDays = (consentType: string): number => {
    switch (consentType) {
      case 'session': return 0; // No retention
      case 'anonymous': return 90; // 90 days default
      case 'account': return 365; // 1 year default
      default: return 0;
    }
  };

  const revokeConsent = async () => {
    try {
      await fetch('/api/consent', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consentId: consentState.consentId
        }),
      });

      sessionStorage.removeItem('therma-consent');
      setConsentState({ hasConsented: false });
      setShowConsentModal(true);
    } catch (error) {
      console.error('Error revoking consent:', error);
    }
  };

  return {
    consentState,
    showConsentModal,
    setShowConsentModal,
    createConsent,
    revokeConsent
  };
};
