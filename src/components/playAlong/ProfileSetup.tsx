'use client';

import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { playAlongUsersRef } from '@/lib/firebase';
import type { PlayAlongUser } from '@/lib/types';

interface ProfileSetupProps {
  user: User;
  onProfileComplete: (profile: PlayAlongUser) => void;
}

export default function ProfileSetup({ user, onProfileComplete }: ProfileSetupProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function checkExisting() {
      try {
        const snap = await getDoc(doc(playAlongUsersRef, user.uid));
        if (snap.exists()) {
          onProfileComplete(snap.data() as PlayAlongUser);
          return;
        }
        // Pre-fill name from Google if available
        if (user.displayName) setName(user.displayName);
      } finally {
        setLoading(false);
      }
    }
    checkExisting();
  }, [user, onProfileComplete]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const digits = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    const normalizedPhone = `+91${digits}`;

    setSaving(true);
    try {
      // Check phone uniqueness
      const existing = await getDocs(
        query(playAlongUsersRef, where('phone', '==', normalizedPhone))
      );
      const collision = existing.docs.find(d => d.id !== user.uid);
      if (collision) {
        setError('This phone number is already registered with another account.');
        return;
      }

      const profile: PlayAlongUser = {
        uid: user.uid,
        name: name.trim(),
        phone: normalizedPhone,
        createdAt: Date.now()
      };
      await setDoc(doc(playAlongUsersRef, user.uid), profile);
      onProfileComplete(profile);
    } catch {
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

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
