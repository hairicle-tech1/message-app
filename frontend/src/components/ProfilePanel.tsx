import { useEffect, useRef, useState } from 'react';
import * as profileApi from '../api/profile';
import type { UserProfile } from '../api/types';
import { useAuth } from '../context/AuthContext';

type Tab = 'profile' | 'security' | 'notifications';

interface ProfilePanelProps {
  onClose: () => void;
}

export function ProfilePanel({ onClose }: ProfilePanelProps) {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarKey, setAvatarKey] = useState(Date.now()); // bust cache after upload

  // Profile tab state
  const [displayName, setDisplayName] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Security tab state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [totpQr, setTotpQr] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpMsg, setTotpMsg] = useState('');

  // Notifications tab state
  const [prefs, setPrefs] = useState({ soundEnabled: true, desktopEnabled: true, emailEnabled: false });
  const [prefsMsg, setPrefsMsg] = useState('');

  useEffect(() => {
    profileApi.getMyProfile().then(({ profile }) => {
      setProfile(profile);
      setDisplayName(profile.displayName);
      setDepartment(profile.department ?? '');
    });
    profileApi.getNotificationPrefs().then(({ prefs }) => setPrefs(prefs));
  }, []);

  // ── Profile ───────────────────────────────────────────────────────────────

  async function handleSaveProfile(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      const { profile: updated } = await profileApi.updateProfile({
        displayName: displayName.trim() || undefined,
        department: department.trim() || null,
      });
      setProfile(updated);
      updateUser({ displayName: updated.displayName });
      setSaveMsg('Saved!');
    } catch (err) {
      setSaveMsg((err as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { profile: updated } = await profileApi.uploadAvatar(file);
      setProfile(updated);
      setAvatarKey(Date.now());
      setSaveMsg('Avatar updated!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg((err as Error).message);
    }
  }

  // ── Security ──────────────────────────────────────────────────────────────

  async function handleChangePassword(e: { preventDefault(): void }) {
    e.preventDefault();
    setPwMsg('');
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match'); return; }
    if (newPw.length < 8) { setPwMsg('Password must be at least 8 characters'); return; }
    try {
      await profileApi.changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg('Password changed!');
    } catch (err) {
      setPwMsg((err as Error).message);
    } finally {
      setTimeout(() => setPwMsg(''), 4000);
    }
  }

  async function handleSetupTotp() {
    try {
      const res = await profileApi.setupTotp();
      setTotpQr(res.qrCodeDataUrl);
      setTotpSecret(res.secret);
      setTotpMsg('Scan the QR code in your authenticator app, then enter the 6-digit code to activate.');
    } catch (err) {
      setTotpMsg((err as Error).message);
    }
  }

  async function handleEnableTotp(e: { preventDefault(): void }) {
    e.preventDefault();
    try {
      await profileApi.enableTotp(totpCode);
      setTotpEnabled(true);
      setTotpQr(''); setTotpSecret(''); setTotpCode('');
      setTotpMsg('2FA enabled!');
    } catch (err) {
      setTotpMsg((err as Error).message);
    } finally {
      setTimeout(() => setTotpMsg(''), 4000);
    }
  }

  async function handleDisableTotp(e: { preventDefault(): void }) {
    e.preventDefault();
    try {
      await profileApi.disableTotp(totpCode);
      setTotpEnabled(false);
      setTotpCode('');
      setTotpMsg('2FA disabled.');
    } catch (err) {
      setTotpMsg((err as Error).message);
    } finally {
      setTimeout(() => setTotpMsg(''), 4000);
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async function handleTogglePref(key: keyof typeof prefs) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      await profileApi.updateNotificationPrefs(updated);
      setPrefsMsg('Saved');
    } catch (err) {
      setPrefs(prefs); // revert
      setPrefsMsg((err as Error).message);
    } finally {
      setTimeout(() => setPrefsMsg(''), 2000);
    }
  }

  const avatarUrl = profile ? profileApi.getAvatarUrl(profile.id) : null;

  return (
    <div className="absolute inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-80 bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-700 px-5 pt-8 pb-6 relative flex-shrink-0">
          <button onClick={onClose}
            className="absolute top-3 right-3 text-indigo-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Avatar */}
          <div className="relative w-fit mx-auto mb-3">
            {avatarUrl ? (
              <img key={avatarKey} src={`${avatarUrl}?v=${avatarKey}`}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-indigo-500"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : null}
            <div className={`w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-indigo-500 ${avatarUrl ? 'hidden' : 'block'}`}>
              {user?.displayName.slice(0, 1).toUpperCase()}
            </div>
            <button onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center text-indigo-600 hover:bg-indigo-50 transition-colors border border-indigo-100">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          <p className="text-white font-bold text-center text-base leading-tight">{profile?.displayName ?? user?.displayName}</p>
          <p className="text-indigo-300 text-xs text-center mt-0.5">@{profile?.username ?? user?.username}</p>
          {profile?.department && (
            <p className="text-indigo-200 text-xs text-center mt-0.5">{profile.department}</p>
          )}
          <span className={`block mx-auto mt-2 w-fit text-xs px-2 py-0.5 rounded-full font-medium ${
            profile?.role === 'admin' ? 'bg-yellow-400 text-yellow-900' : 'bg-indigo-500 text-white'}`}>
            {profile?.role}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          {(['profile', 'security', 'notifications'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                tab === t ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              {t === 'notifications' ? '🔔' : t === 'security' ? '🔒' : '👤'} {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── PROFILE tab ── */}
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Display Name</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Department</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Sales, HR, Production"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <p className="text-xs text-slate-400 mt-1">Changing department will move you to the new team automatically.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                <p className="text-sm text-slate-600 px-3 py-2 bg-slate-50 rounded-xl">{profile?.email}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Username</label>
                <p className="text-sm text-slate-600 px-3 py-2 bg-slate-50 rounded-xl">@{profile?.username}</p>
              </div>
              {saveMsg && (
                <p className={`text-xs text-center font-medium ${saveMsg === 'Saved!' || saveMsg.includes('updated') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {saveMsg}
                </p>
              )}
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          )}

          {/* ── SECURITY tab ── */}
          {tab === 'security' && (
            <div className="space-y-6">
              {/* Change password */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">Change Password</h3>
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Current password"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {pwMsg && (
                    <p className={`text-xs ${pwMsg === 'Password changed!' ? 'text-emerald-600' : 'text-red-500'}`}>{pwMsg}</p>
                  )}
                  <button type="submit"
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors">
                    Update password
                  </button>
                </form>
              </div>

              {/* 2FA */}
              <div className="border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">Two-Factor Auth (2FA)</h3>
                    <p className="text-xs text-slate-400 mt-0.5">TOTP via authenticator app</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${totpEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {totpEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                {!totpEnabled && !totpQr && (
                  <button onClick={handleSetupTotp}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors">
                    Set up 2FA
                  </button>
                )}

                {totpQr && (
                  <div className="space-y-3">
                    <img src={totpQr} alt="QR Code" className="w-40 h-40 mx-auto rounded-xl border border-slate-200" />
                    <p className="text-xs text-slate-500 text-center break-all">Secret: <span className="font-mono text-slate-700">{totpSecret}</span></p>
                    <form onSubmit={handleEnableTotp} className="flex gap-2">
                      <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
                        maxLength={6} placeholder="6-digit code"
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <button type="submit" className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold">
                        Activate
                      </button>
                    </form>
                  </div>
                )}

                {totpEnabled && (
                  <form onSubmit={handleDisableTotp} className="flex gap-2">
                    <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)}
                      maxLength={6} placeholder="Enter code to disable"
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-red-400" />
                    <button type="submit" className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold">
                      Disable
                    </button>
                  </form>
                )}

                {totpMsg && (
                  <p className={`text-xs mt-2 ${totpMsg.includes('enabled') || totpMsg.includes('Scan') ? 'text-indigo-600' : totpMsg.includes('!') ? 'text-emerald-600' : 'text-red-500'}`}>
                    {totpMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS tab ── */}
          {tab === 'notifications' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">Control how you receive notifications.</p>

              {([
                { key: 'soundEnabled' as const, label: 'Sound', desc: 'Play a sound for new messages' },
                { key: 'desktopEnabled' as const, label: 'Desktop notifications', desc: 'Show browser/OS notifications' },
                { key: 'emailEnabled' as const, label: 'Email notifications', desc: 'Send email for missed messages' },
              ]).map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                  <button onClick={() => handleTogglePref(key)}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${prefs[key] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              ))}

              {prefsMsg && <p className="text-xs text-emerald-600 text-center">{prefsMsg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
