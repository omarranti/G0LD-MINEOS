'use client';

import { useState } from 'react';

interface ConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsent: (type: 'session' | 'anonymous' | 'account', retentionDays?: number) => void;
}

export default function ConsentModal({ isOpen, onClose, onConsent }: ConsentModalProps) {
  const [selectedType, setSelectedType] = useState<'session' | 'anonymous' | 'account'>('session');
  const [customRetentionDays, setCustomRetentionDays] = useState<number>(90);

  if (!isOpen) return null;

  const handleConsent = () => {
    const retentionDays = selectedType === 'session' ? 0 : customRetentionDays;
    onConsent(selectedType, retentionDays);
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-200/50">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-400 via-red-500 to-pink-500 flex items-center justify-center">
            <span className="text-white font-bold text-xl">T</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Your Privacy Matters</h2>
          <p className="text-sm text-gray-600">
            Choose how Therma Assistant handles your data
          </p>
        </div>

        {/* Consent Options */}
        <div className="space-y-4 mb-6">
          {/* Session Only */}
          <label className="block">
            <input
              type="radio"
              name="consentType"
              value="session"
              checked={selectedType === 'session'}
              onChange={(e) => setSelectedType(e.target.value as 'session')}
              className="sr-only"
            />
            <div className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedType === 'session' 
                ? 'border-orange-400 bg-orange-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}>
              <div className="flex items-start space-x-3">
                <div className={`w-5 h-5 rounded-full border-2 mt-0.5 ${
                  selectedType === 'session' 
                    ? 'border-orange-400 bg-orange-400' 
                    : 'border-gray-300'
                }`}>
                  {selectedType === 'session' && (
                    <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Session Only</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    No data saved. Everything is cleared when you close the chat.
                  </p>
                  <div className="text-xs text-gray-500 mt-2">
                    ✓ No storage ✓ No tracking ✓ Complete privacy
                  </div>
                </div>
              </div>
            </div>
          </label>

          {/* Anonymous */}
          <label className="block">
            <input
              type="radio"
              name="consentType"
              value="anonymous"
              checked={selectedType === 'anonymous'}
              onChange={(e) => setSelectedType(e.target.value as 'anonymous')}
              className="sr-only"
            />
            <div className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedType === 'anonymous' 
                ? 'border-orange-400 bg-orange-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}>
              <div className="flex items-start space-x-3">
                <div className={`w-5 h-5 rounded-full border-2 mt-0.5 ${
                  selectedType === 'anonymous' 
                    ? 'border-orange-400 bg-orange-400' 
                    : 'border-gray-300'
                }`}>
                  {selectedType === 'anonymous' && (
                    <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Anonymous Insights</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Save patterns anonymously to improve Therma's insights.
                  </p>
                  <div className="text-xs text-gray-500 mt-2">
                    ✓ No personal info ✓ Aggregated data ✓ Helps others
                  </div>
                </div>
              </div>
            </div>
          </label>

          {/* Account Linked */}
          <label className="block">
            <input
              type="radio"
              name="consentType"
              value="account"
              checked={selectedType === 'account'}
              onChange={(e) => setSelectedType(e.target.value as 'account')}
              className="sr-only"
            />
            <div className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedType === 'account' 
                ? 'border-orange-400 bg-orange-50' 
                : 'border-gray-200 hover:border-gray-300'
            }`}>
              <div className="flex items-start space-x-3">
                <div className={`w-5 h-5 rounded-full border-2 mt-0.5 ${
                  selectedType === 'account' 
                    ? 'border-orange-400 bg-orange-400' 
                    : 'border-gray-300'
                }`}>
                  {selectedType === 'account' && (
                    <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Full Experience</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Save to your Therma account for personalized insights.
                  </p>
                  <div className="text-xs text-gray-500 mt-2">
                    ✓ Personal insights ✓ Long-term patterns ✓ Export data
                  </div>
                </div>
              </div>
            </div>
          </label>
        </div>

        {/* Retention Settings for non-session types */}
        {selectedType !== 'session' && (
          <div className="mb-6 p-4 bg-gray-50 rounded-2xl">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Retention Period
            </label>
            <select
              value={customRetentionDays}
              onChange={(e) => setCustomRetentionDays(Number(e.target.value))}
              className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Your data will be automatically deleted after this period
            </p>
          </div>
        )}

        {/* Privacy Notice */}
        <div className="mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-200">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">Privacy Promise</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• Your data is encrypted and secure</li>
            <li>• You can download or delete your data anytime</li>
            <li>• We never sell your personal information</li>
            <li>• HIPAA-compliant data handling</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConsent}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-400 to-red-500 text-white font-semibold hover:from-orange-500 hover:to-red-600 transition-all shadow-lg"
          >
            Continue
          </button>
        </div>

        {/* Legal Links */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            By continuing, you agree to our{' '}
            <a href="/privacy" className="text-orange-500 hover:underline">Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms-of-service" className="text-orange-500 hover:underline">Terms of Service</a>
          </p>
        </div>
      </div>
    </div>
  );
}
