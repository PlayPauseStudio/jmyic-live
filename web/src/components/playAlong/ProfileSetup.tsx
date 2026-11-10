'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';

interface ProfileSetupProps {
  user: User;
  /** Registers with the game server; resolves to an error message, or null on success. */
  onRegister: (name: string, phone: string) => Promise<string | null>;
}

/**
 * Name + mobile, sent to the game server. The server checks the number and
 * that no other account has registered it; the profile lives there (not in
 * Firestore), and a returning phone skips this screen automatically.
 */
export default function ProfileSetup({ user, onRegister }: ProfileSetupProps) {
  // Pre-fill name from Google if available
  const [name, setName] = useState(user.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const digits = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSaving(true);
    try {
      const problem = await onRegister(name.trim(), digits);
      if (problem) setError(problem);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-bold text-white text-center mb-2">One more step!</h2>
        <p className="text-purple-300 text-center mb-8 text-sm">
          We need your name and phone so we can find you in the audience.
        </p>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-white/70 text-xs font-medium uppercase tracking-wide">Your Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                maxLength={60}
                className="mt-1 w-full px-4 py-3 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div>
              <label className="text-white/70 text-xs font-medium uppercase tracking-wide">Mobile Number</label>
              <div className="mt-1 flex">
                <span className="flex items-center px-3 bg-white/10 border border-r-0 border-white/20 rounded-l-xl text-white/60 text-sm">+91</span>
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  required
                  className="flex-1 px-4 py-3 rounded-r-xl bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-500 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : "Let's Play!"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
