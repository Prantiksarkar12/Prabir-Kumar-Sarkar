import React, { useState } from 'react';
import { apiClient } from '../../lib/api';
import { User, AccountType } from '../../types/chat';
import {
  MessageSquare,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  Loader2,
  Sparkles,
  Briefcase,
  Building2,
  Check,
  Eye,
  EyeOff,
  X,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { useToast } from '../ui/Toast';

interface AuthModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess: (user: User) => void;
  initialMode?: 'login' | 'register';
  initialAccountType?: AccountType;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  initialMode = 'login',
  initialAccountType = 'PERSONAL',
}) => {
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot'>(
    initialMode === 'register' ? 'register' : 'login'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const { showToast } = useToast();

  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>(initialAccountType);

  // Sync state if props change
  React.useEffect(() => {
    setAuthView(initialMode === 'register' ? 'register' : 'login');
    setError(null);
    setForgotSent(false);
  }, [initialMode]);

  React.useEffect(() => {
    if (initialAccountType) {
      setSelectedAccountType(initialAccountType);
    }
  }, [initialAccountType]);

  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    email: '',
    identifier: '',
    password: '',
    category: '',
    extra_field: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (authView === 'register') {
        if (!formData.username || !formData.display_name || !formData.email || !formData.password) {
          throw new Error('All primary fields are required.');
        }

        const profileMeta: any = {};
        if (selectedAccountType === 'CREATOR') {
          profileMeta.category = formData.category || 'Digital Creator';
          profileMeta.website_url = formData.extra_field || null;
        } else if (selectedAccountType === 'BUSINESS') {
          profileMeta.business_name = formData.display_name;
          profileMeta.category = formData.category || 'Company';
          profileMeta.address = formData.extra_field || null;
        } else if (selectedAccountType === 'PROFESSIONAL') {
          profileMeta.profession_category = formData.category || 'Consultant';
          profileMeta.hourly_rate = formData.extra_field || '$75/hr';
        }

        const res = await apiClient.auth.register({
          username: formData.username,
          display_name: formData.display_name,
          email: formData.email,
          password: formData.password,
          account_type: selectedAccountType,
          profile_meta: profileMeta,
        });
        showToast(`Welcome, ${res.user.display_name}!`, 'success');
        onSuccess(res.user);
      } else if (authView === 'login') {
        if (!formData.identifier || !formData.password) {
          throw new Error('Please enter your username/email and password.');
        }
        const res = await apiClient.auth.login({
          identifier: formData.identifier,
          password: formData.password,
        });
        showToast(`Welcome back, ${res.user.display_name}!`, 'success');
        onSuccess(res.user);
      } else if (authView === 'forgot') {
        if (!formData.email) {
          throw new Error('Please enter your email address.');
        }
        setForgotSent(true);
        showToast('Password recovery instructions sent if an account exists.', 'info');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication request failed');
    } finally {
      setLoading(false);
    }
  };

  const accountTypesList = [
    {
      type: 'PERSONAL' as AccountType,
      title: 'Personal',
      desc: 'Private conversations & groups',
      icon: UserIcon,
    },
    {
      type: 'CREATOR' as AccountType,
      title: 'Creator',
      desc: 'Followers, broadcast & community',
      icon: Sparkles,
    },
    {
      type: 'BUSINESS' as AccountType,
      title: 'Business',
      desc: 'Customer inbox & team workspace',
      icon: Building2,
    },
    {
      type: 'PROFESSIONAL' as AccountType,
      title: 'Professional',
      desc: 'Consulting & private advisory',
      icon: Briefcase,
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl p-7 sm:p-8 flex flex-col gap-5 text-zinc-100 animate-in fade-in zoom-in-95 duration-200 my-auto relative">
        
        {/* Modal Top Bar with Close button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="flex flex-col items-center text-center gap-2 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-rose-600/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
            {authView === 'forgot' ? (
              <KeyRound className="w-6 h-6" />
            ) : (
              <MessageSquare className="w-6 h-6" />
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {authView === 'register' && 'Create Your Account'}
            {authView === 'login' && 'Sign in to Pulse'}
            {authView === 'forgot' && 'Reset Your Password'}
          </h2>
          <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
            {authView === 'register' && 'Choose your account type to register your workspace.'}
            {authView === 'login' && 'Enter your credentials to access your workspace.'}
            {authView === 'forgot' && 'Enter your registered email to receive recovery instructions.'}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
            {error}
          </div>
        )}

        {authView === 'forgot' && forgotSent ? (
          <div className="flex flex-col gap-4 text-center py-4">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
              If an account with <strong>{formData.email}</strong> exists, instructions to reset your password have been dispatched.
            </div>
            <button
              type="button"
              onClick={() => {
                setAuthView('login');
                setForgotSent(false);
                setError(null);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors"
            >
              Return to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {authView === 'register' ? (
              <>
                {/* Account Type Selection */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Account Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {accountTypesList.map((item) => {
                      const isSelected = selectedAccountType === item.type;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setSelectedAccountType(item.type)}
                          className={`p-2.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                            isSelected
                              ? 'bg-rose-600/20 border-rose-500 text-white shadow-sm ring-1 ring-rose-500/30'
                              : 'bg-zinc-800/60 border-zinc-700/60 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-rose-400' : 'text-zinc-400'}`} />
                            {isSelected && <Check className="w-3.5 h-3.5 text-rose-400 stroke-[3]" />}
                          </div>
                          <span className="text-xs font-bold">{item.title}</span>
                          <span className="text-[10px] text-zinc-400 leading-tight">{item.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    {selectedAccountType === 'BUSINESS' ? 'Company Name' : 'Display Name'}
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      name="display_name"
                      value={formData.display_name}
                      onChange={handleChange}
                      placeholder={selectedAccountType === 'BUSINESS' ? 'Acme Studio' : 'Alex Rivera'}
                      required
                      className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <span className="text-zinc-500 absolute left-3.5 top-2 text-xs font-mono">@</span>
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      placeholder="alex_rivera"
                      required
                      className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                </div>

                {selectedAccountType !== 'PERSONAL' && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                      {selectedAccountType === 'CREATOR'
                        ? 'Creator Category'
                        : selectedAccountType === 'BUSINESS'
                        ? 'Business Industry'
                        : 'Profession'}
                    </label>
                    <input
                      type="text"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      placeholder={
                        selectedAccountType === 'CREATOR'
                          ? 'e.g. Digital Artist, Streamer'
                          : selectedAccountType === 'BUSINESS'
                          ? 'e.g. Software, Agency'
                          : 'e.g. Consultant, Engineer'
                      }
                      className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="alex@example.com"
                      required
                      className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>
                </div>
              </>
            ) : authView === 'login' ? (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Email or username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    name="identifier"
                    value={formData.identifier}
                    onChange={handleChange}
                    placeholder="Enter your email or username"
                    required
                    className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Registered Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@domain.com"
                    required
                    className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {authView !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Password
                  </label>
                  {authView === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthView('forgot');
                        setError(null);
                      }}
                      className="text-[11px] text-rose-400 hover:text-rose-300 font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                    className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200 p-0.5 rounded transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>
                    {authView === 'register' && `Create ${selectedAccountType} Account`}
                    {authView === 'login' && 'Sign In'}
                    {authView === 'forgot' && 'Send Recovery Instructions'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Switch mode links */}
        <div className="text-center text-xs text-zinc-400 pt-1 border-t border-zinc-800/80">
          {authView === 'register' && (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthView('login');
                  setError(null);
                }}
                className="text-rose-400 hover:text-rose-300 font-semibold underline underline-offset-4"
              >
                Sign in
              </button>
            </span>
          )}
          {authView === 'login' && (
            <span>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthView('register');
                  setError(null);
                }}
                className="text-rose-400 hover:text-rose-300 font-semibold underline underline-offset-4"
              >
                Create one
              </button>
            </span>
          )}
          {authView === 'forgot' && !forgotSent && (
            <span>
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthView('login');
                  setError(null);
                }}
                className="text-rose-400 hover:text-rose-300 font-semibold underline underline-offset-4"
              >
                Return to Sign in
              </button>
            </span>
          )}
        </div>

        {/* Secure authentication status */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Encrypted transmission & secure session authorization</span>
        </div>
      </div>
    </div>
  );
};
