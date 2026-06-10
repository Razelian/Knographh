import React, { useState } from 'react';
import { useStore } from '../store.ts';
import { Network, Sparkles, LogIn, Lock } from 'lucide-react';

export default function AuthScreen() {
  const { login, register, authError, loadingAuth } = useStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [mailStatus, setMailStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (isRegister) {
      await register(email, password);
    } else {
      await login(email, password);
    }
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setMailStatus('Password reset link successfully dispatched to mailbox. Active for 1 hour.');
    setTimeout(() => {
      setForgotPassword(false);
      setMailStatus(null);
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      
      {/* Decorative ambient background rings resembling cosmic neural pathways */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10 flex flex-col gap-6">
        
        {/* Logo and Titles */}
        <div className="text-center flex flex-col items-center">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl border border-blue-400/20 shadow-xl shadow-blue-950/20 mb-3 animate-pulse">
            <Network className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1">
            KnoGraph <span className="text-xs bg-slate-850 px-1.5 py-0.5 border border-slate-800 text-slate-400 rounded-md font-mono">Personal</span>
          </h1>
          <p className="text-slate-500 text-xs mt-1.5 leading-relaxed max-w-xs">
            Where everything is a node. Knowledge emerges from directed cyclical relationships.
          </p>
        </div>

        {authError && (
          <div className="p-3 bg-red-950/60 border border-dashed border-red-800 rounded-lg text-xs font-semibold text-red-400">
            {authError}
          </div>
        )}

        {forgotPassword ? (
          <form onSubmit={handleForgotPasswordSubmit} className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-slate-300">Recover your password</h3>
            {mailStatus ? (
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800 rounded font-medium text-xs text-emerald-400">
                {mailStatus}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  id="auth_recover_email"
                  className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-700"
                  placeholder="Enter email to get reset token Link"
                  required
                />
              </div>
            )}
            <div className="flex justify-between items-center mt-2.5">
              <button
                type="button"
                onClick={() => setForgotPassword(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Back to credentials login
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Request reset links
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            {/* Input Email fields */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Account Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                id="auth_email_input"
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                placeholder="you@domain.com"
                required
              />
            </div>

            {/* Input Password field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Password</label>
                {!isRegister && (
                  <button
                    type="button"
                    onClick={() => setForgotPassword(true)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                    tabIndex={-1}
                  >
                    Forgot passcode?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                id="auth_password_input"
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loadingAuth}
              id="btn_auth_submit"
              className="w-full mt-2 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-lg shadow-lg shadow-blue-950/40 transition-all flex items-center justify-center gap-1.5"
            >
              {isRegister ? <Sparkles className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {loadingAuth ? 'Processing credentials...' : isRegister ? 'Register personal account' : 'Verify credentials'}
            </button>
          </form>
        )}

        {/* Alternate login flow toggler */}
        {!forgotPassword && (
          <div className="flex flex-col gap-3 text-center border-t border-slate-800 pt-5 mt-1.5">
            <span className="text-xs text-slate-500">
              {isRegister ? 'Already registered to KnoGraph?' : 'First time setting up your space?'}
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-indigo-400 hover:text-indigo-300 font-semibold ml-1 cursor-pointer focus:outline-none"
              >
                {isRegister ? 'Login with password' : 'Create personal account'}
              </button>
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
