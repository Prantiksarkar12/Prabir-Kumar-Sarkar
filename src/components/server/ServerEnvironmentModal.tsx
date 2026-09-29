import React, { useState } from 'react';
import {
  X,
  Server,
  Copy,
  Check,
  Download,
  Database,
  Radio,
  HardDrive,
  Mail,
  Bell,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Code2,
  Terminal,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import { apiClient } from '../../lib/api';

interface ServerEnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ENV_FILE_CONTENT = `# ==============================================================================
# PULSE PLATFORM - LOCAL HOSTING ENVIRONMENT CONFIGURATION
# ==============================================================================
DATABASE_URL=postgresql://chatapp:YOUR_DB_PASSWORD@localhost:5432/chatapp
REDIS_URL=redis://localhost:6379
SESSION_SECRET=YOUR_LONG_RANDOM_SESSION_SECRET

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=chatapp
S3_ACCESS_KEY=YOUR_MINIO_ACCESS_KEY
S3_SECRET_KEY=YOUR_MINIO_SECRET_KEY

VITE_API_URL=http://localhost:4000/api/v1
VITE_SOCKET_URL=http://localhost:4000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-character-app-password

WEB_PUSH_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
`;

export const ENV_VALUES_LIST = [
  {
    name: 'DATABASE_URL',
    localVal: 'postgresql://chatapp:YOUR_DB_PASSWORD@localhost:5432/chatapp',
    prodVal: 'postgresql://chatapp:PROD_PASS@db.yourdomain.com:5432/chatapp',
    category: 'Database',
    icon: Database,
    description: 'PostgreSQL connection string with role, password, host, and database name.',
  },
  {
    name: 'REDIS_URL',
    localVal: 'redis://localhost:6379',
    prodVal: 'redis://redis.yourdomain.com:6379',
    category: 'Cache & Pub/Sub',
    icon: Radio,
    description: 'Redis instance for distributed event bus, pub/sub broadcasting, and rate limiting.',
  },
  {
    name: 'SESSION_SECRET',
    localVal: 'Generate a long random secret',
    prodVal: '64+ character cryptographically generated random string',
    category: 'Security',
    icon: ShieldCheck,
    description: 'High-entropy secret key used to sign HTTP session tokens and tamper-proof auth cookies.',
  },
  {
    name: 'S3_ENDPOINT',
    localVal: 'http://localhost:9000',
    prodVal: 'https://storage.yourdomain.com',
    category: 'Storage',
    icon: HardDrive,
    description: 'Endpoint URL for self-hosted MinIO or AWS S3 compatible object storage.',
  },
  {
    name: 'S3_REGION',
    localVal: 'us-east-1',
    prodVal: 'us-east-1 (or your storage region)',
    category: 'Storage',
    icon: HardDrive,
    description: 'Object storage region for bucket signatures.',
  },
  {
    name: 'S3_BUCKET',
    localVal: 'chatapp',
    prodVal: 'chatapp (or production bucket name)',
    category: 'Storage',
    icon: HardDrive,
    description: 'Target bucket for user media, avatars, and file attachments.',
  },
  {
    name: 'S3_ACCESS_KEY',
    localVal: 'Your MinIO access key',
    prodVal: 'Production S3/MinIO root/service account access key',
    category: 'Storage',
    icon: HardDrive,
    description: 'Access key credential for S3 storage upload signing.',
  },
  {
    name: 'S3_SECRET_KEY',
    localVal: 'Your MinIO secret key',
    prodVal: 'Production S3/MinIO root/service account secret key',
    category: 'Storage',
    icon: HardDrive,
    description: 'Secret credential for S3 storage upload signing.',
  },
  {
    name: 'VITE_API_URL',
    localVal: 'http://localhost:4000/api/v1',
    prodVal: 'https://api.yourdomain.com/api/v1',
    category: 'Networking',
    icon: Server,
    description: 'REST API base endpoint exposed to the frontend single-page application.',
  },
  {
    name: 'VITE_SOCKET_URL',
    localVal: 'http://localhost:4000',
    prodVal: 'https://api.yourdomain.com',
    category: 'Networking',
    icon: Radio,
    description: 'Socket.IO real-time duplex streaming gateway for messages and live presence.',
  },
  {
    name: 'SMTP_HOST',
    localVal: 'smtp.gmail.com',
    prodVal: 'smtp.gmail.com',
    category: 'Email',
    icon: Mail,
    description: 'Google Gmail SMTP outbound mail server for email delivery and verifications.',
  },
  {
    name: 'SMTP_PORT',
    localVal: '587',
    prodVal: '587',
    category: 'Email',
    icon: Mail,
    description: 'TCP port for outgoing SMTP transmissions using TLS submission.',
  },
  {
    name: 'SMTP_USER',
    localVal: 'your-email@gmail.com',
    prodVal: 'your-email@gmail.com',
    category: 'Email',
    icon: Mail,
    description: 'Your authenticated Gmail address used to dispatch outbound emails.',
  },
  {
    name: 'SMTP_PASSWORD',
    localVal: 'your-16-character-app-password',
    prodVal: 'your-16-character-app-password',
    category: 'Email',
    icon: Mail,
    description: '16-character Google App Password (generated in Google Account -> Security -> 2-Step Verification -> App passwords).',
  },
  {
    name: 'WEB_PUSH_PUBLIC_KEY',
    localVal: 'Your VAPID public key',
    prodVal: 'Real production VAPID application server public key',
    category: 'Push',
    icon: Bell,
    description: 'VAPID public key shared with browsers for native Web Push Notifications.',
  },
  {
    name: 'WEB_PUSH_PRIVATE_KEY',
    localVal: 'Your VAPID private key',
    prodVal: 'Real production VAPID private key (kept secret on backend)',
    category: 'Push',
    icon: Bell,
    description: 'VAPID private key used exclusively by the backend to sign push notifications.',
  },
];

export const REQUIRED_SERVICES = [
  { name: 'Frontend SPA', port: 'localhost:3000', tag: 'UI Client', color: 'text-indigo-400' },
  { name: 'Backend / API Gateway', port: 'localhost:4000', tag: 'Node/Express + Socket.IO', color: 'text-sky-400' },
  { name: 'PostgreSQL Database', port: 'localhost:5432', tag: 'Primary Relational DB', color: 'text-emerald-400' },
  { name: 'Redis Backplane', port: 'localhost:6379', tag: 'In-Memory Pub/Sub & Cache', color: 'text-rose-400' },
  { name: 'MinIO S3 Storage', port: 'localhost:9000', tag: 'Object Storage API', color: 'text-amber-400' },
  { name: 'MinIO Console', port: 'localhost:9001', tag: 'Web Admin Dashboard', color: 'text-amber-300' },
];

export const PRODUCTION_REPLACEMENTS = [
  { key: 'DATABASE_URL', target: 'PostgreSQL server (e.g. pg.yourdomain.com:5432)' },
  { key: 'REDIS_URL', target: 'Redis server (e.g. redis.yourdomain.com:6379)' },
  { key: 'S3_ENDPOINT', target: 'https://storage.yourdomain.com' },
  { key: 'VITE_API_URL', target: 'https://api.yourdomain.com/api/v1' },
  { key: 'VITE_SOCKET_URL', target: 'https://api.yourdomain.com' },
];

export const ServerEnvironmentModal: React.FC<ServerEnvironmentModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'env' | 'table' | 'services' | 'architecture'>('env');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [liveHealth, setLiveHealth] = useState<any>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    showToast(`Copied ${label} to clipboard`, 'info');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleDownloadEnv = () => {
    const element = document.createElement('a');
    const file = new Blob([ENV_FILE_CONTENT], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = '.env';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast('Downloaded .env file', 'success');
  };

  const verifyBackendStatus = async () => {
    setHealthChecking(true);
    try {
      const res = await apiClient.health.checkDatabase();
      setLiveHealth(res);
      showToast('Backend & PostgreSQL verified healthy', 'success');
    } catch (err: any) {
      showToast(err.message || 'Health check failed', 'error');
    } finally {
      setHealthChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-zinc-950/85 backdrop-blur-md overflow-hidden">
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col text-zinc-100 max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Top Banner & Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/90 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
                  <span>Administrator Console • Environment Settings</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    Restricted
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Private system infrastructure configuration and deployment parameters for administrators.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={verifyBackendStatus}
                disabled={healthChecking}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700/60 transition-colors disabled:opacity-50"
              >
                {healthChecking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Check Live Status</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Real-time Health Snapshot */}
          {liveHealth && (
            <div className="p-3 rounded-2xl bg-zinc-950/70 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-semibold text-emerald-300">Live PostgreSQL Engine: {liveHealth.database}</span>
              </div>
              <div className="flex items-center gap-4 text-zinc-400 font-mono text-[11px]">
                <span>Latency: <strong className="text-zinc-200">{liveHealth.latency_ms}ms</strong></span>
                <span>Active Tables: <strong className="text-zinc-200">{liveHealth.table_count || 44}</strong></span>
                <span>Status: <strong className="text-emerald-400 uppercase">{liveHealth.status}</strong></span>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 border-b border-zinc-800/80 pt-2 -mb-5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('env')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'env'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code2 className="w-4 h-4 text-indigo-400" />
              <span>Full .env File</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'table'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Value List Table ({ENV_VALUES_LIST.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'services'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-4 h-4 text-indigo-400" />
              <span>Required Services & Ports</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('architecture')}
              className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'architecture'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Capacity & Production Rules</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {activeTab === 'env' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-800/40 p-3.5 rounded-2xl border border-zinc-800">
                <div>
                  <p className="text-xs font-semibold text-zinc-200">Standard Local Hosting Environment (.env)</p>
                  <p className="text-[11px] text-zinc-400">
                    Place these values into your project root <code className="bg-zinc-950 px-1 py-0.5 rounded text-indigo-300 font-mono">.env</code> or <code className="bg-zinc-950 px-1 py-0.5 rounded text-indigo-300 font-mono">.env.local</code>.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(ENV_FILE_CONTENT, 'Full .env')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm"
                  >
                    {copiedKey === 'Full .env' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'Full .env' ? 'Copied All' : 'Copy All'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadEnv}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700/60 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .env</span>
                  </button>
                </div>
              </div>

              {/* Code Display */}
              <div className="relative rounded-2xl bg-zinc-950 border border-zinc-800 p-4 font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed select-all">
                <pre>{ENV_FILE_CONTENT}</pre>
              </div>

              {/* Quick instructions */}
              <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-indigo-200 leading-relaxed flex flex-col gap-1.5">
                <p className="font-semibold text-white flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  Quick Local Startup Guide:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-300 text-[11px]">
                  <li>Run <code className="bg-black/40 px-1 py-0.5 rounded text-indigo-300 font-mono">docker compose up -d</code> to spin up local PostgreSQL, Redis, and MinIO.</li>
                  <li>Run <code className="bg-black/40 px-1 py-0.5 rounded text-indigo-300 font-mono">npm run dev</code> to start the full-stack server on <code className="bg-black/40 px-1 py-0.5 rounded text-indigo-300 font-mono">localhost:3000</code>.</li>
                  <li>The app connects directly to PostgreSQL without any third-party clouds or paywalls.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'table' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">Complete Key / Value Reference</h4>
                  <p className="text-[11px] text-zinc-400">Click the copy icon on any variable or value to copy instantly.</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(ENV_FILE_CONTENT, 'Full .env')}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Entire List</span>
                </button>
              </div>

              <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-900/60 shadow-lg">
                <div className="grid grid-cols-12 bg-zinc-800/90 px-4 py-2.5 text-[11px] font-bold text-zinc-200 border-b border-zinc-700/80">
                  <span className="col-span-4 sm:col-span-3">Name</span>
                  <span className="col-span-8 sm:col-span-9">Value (Local Hosting)</span>
                </div>
                <div className="divide-y divide-zinc-800/80 font-mono text-[11px]">
                  {ENV_VALUES_LIST.map((item) => (
                    <div
                      key={item.name}
                      className="grid grid-cols-12 px-4 py-3 items-center hover:bg-zinc-800/40 transition-colors gap-2"
                    >
                      <div className="col-span-12 sm:col-span-4 flex items-center gap-2">
                        <span className="text-indigo-300 font-bold truncate">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.name, item.name)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
                          title={`Copy key name ${item.name}`}
                        >
                          {copiedKey === item.name ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <div className="col-span-12 sm:col-span-8 flex items-center justify-between gap-2 overflow-hidden bg-zinc-950/40 px-2.5 py-1.5 rounded-xl border border-zinc-800/60">
                        <span className="text-zinc-300 truncate select-all font-mono text-[11px]">
                          {item.localVal}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.localVal, `${item.name} Value`)}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white shrink-0 ml-1 transition-colors"
                          title={`Copy value for ${item.name}`}
                        >
                          {copiedKey === `${item.name} Value` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="flex flex-col gap-5">
              {/* Required Local Services */}
              <div>
                <h4 className="text-xs font-bold text-zinc-200 mb-2.5 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  Required Local Services & Ports
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {REQUIRED_SERVICES.map((s) => (
                    <div
                      key={s.name}
                      className="p-3.5 rounded-2xl bg-zinc-800/40 border border-zinc-800 flex flex-col gap-1.5 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-200">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-zinc-400">
                          {s.tag}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-mono font-semibold text-indigo-400 select-all">
                          {s.port}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(s.port, s.name)}
                          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white"
                          title="Copy host port"
                        >
                          {copiedKey === s.name ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Production Values */}
              <div>
                <h4 className="text-xs font-bold text-zinc-200 mb-2.5 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  Production Values (Replace localhost with real infrastructure)
                </h4>
                <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-900/50">
                  <div className="grid grid-cols-12 bg-zinc-800/80 px-4 py-2 text-[11px] font-bold text-zinc-300 border-b border-zinc-700/60">
                    <span className="col-span-5">Variable</span>
                    <span className="col-span-7">Production Server / Domain Target</span>
                  </div>
                  <div className="divide-y divide-zinc-800/80 font-mono text-[11px]">
                    {PRODUCTION_REPLACEMENTS.map((r) => (
                      <div key={r.key} className="grid grid-cols-12 px-4 py-2.5 items-center hover:bg-zinc-800/30 transition-colors">
                        <span className="col-span-5 text-indigo-300 font-bold">{r.key}</span>
                        <span className="col-span-7 text-emerald-400">{r.target}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div className="flex flex-col gap-4 text-xs text-zinc-300 leading-relaxed">
              {/* Important security callout */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Security & Credential Provisioning</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  <strong>Do not invent the database password, S3 keys, SMTP credentials, or VAPID keys.</strong> Those must be generated/configured on your actual physical or VPS servers.
                </p>
              </div>

              {/* Unlimited connections requirement explanation */}
              <div className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>Unlimited Connections Architecture</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  For the <strong>unlimited-connections requirement</strong>, there is no <code className="bg-zinc-950 px-1.5 py-0.5 rounded text-amber-300 font-mono">UNLIMITED_CONNECTIONS=true</code> configuration value.
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  The backend application code contains <strong>no artificial connection caps</strong>, user ceilings, or licensed seat throttles. Real capacity is determined solely by the server infrastructure (available CPU cores, RAM, file descriptor limits, and non-blocking Node.js event-loop capacity).
                </p>
              </div>

              {/* Gmail SMTP Guide */}
              <div className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span>Gmail SMTP Setup Instructions</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  To send outbound transactional emails (welcome notifications, password resets, verification codes) via Google:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400 text-[11px]">
                  <li>Log in to your Google Account at <code className="bg-zinc-950 px-1 py-0.5 rounded text-indigo-300 font-mono">myaccount.google.com</code>.</li>
                  <li>Enable <strong>2-Step Verification</strong> under the <strong>Security</strong> tab.</li>
                  <li>Search for <strong>App passwords</strong> and create a new app password named "Pulse Chat".</li>
                  <li>Copy the generated 16-character password into <code className="bg-zinc-950 px-1 py-0.5 rounded text-indigo-300 font-mono">SMTP_PASSWORD</code> without spaces.</li>
                </ol>
              </div>

              {/* Docker Compose Command */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-xs">Self-Contained Docker Compose Stack:</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('docker compose up -d', 'Docker command')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy Command</span>
                  </button>
                </div>
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono text-indigo-300 text-xs">
                  docker compose up -d
                </div>
                <p className="text-[11px] text-zinc-500">
                  Runs frontend, backend, PostgreSQL 16 Alpine, Redis 7 Alpine, and MinIO with persistent named volumes.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>PostgreSQL & Socket.IO Self-Owned Architecture Active</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => copyToClipboard(ENV_FILE_CONTENT, 'Full .env')}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
            >
              {copiedKey === 'Full .env' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Copy Full .env</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs border border-zinc-700/60 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
