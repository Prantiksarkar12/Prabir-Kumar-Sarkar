import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Database,
  FileText,
  Image as ImageIcon,
  Mic,
  FileCode,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Shield,
  Layers,
  Copy,
  Check,
  Server,
  Cloud,
  FolderArchive,
  BarChart2,
  Clock,
  User as UserIcon,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { StorageStats } from '../../types/chat';
import { useToast } from '../ui/Toast';

interface StorageMonitoringProps {
  onRefreshParent?: () => void;
}

export const StorageMonitoring: React.FC<StorageMonitoringProps> = ({ onRefreshParent }) => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadStorageStats = async () => {
    setLoading(true);
    try {
      const data = await apiClient.admin.getStorageStats();
      setStats(data);
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error('[Storage Monitoring Error]', err);
      showToast('Failed to load storage statistics from backend', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStorageStats();
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(`Copied ${key} to clipboard`, 'success');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading && !stats) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="text-sm font-medium">Querying S3-compatible Object Storage API...</span>
        <span className="text-xs text-zinc-500">Retrieving bucket metadata and disk volume metrics</span>
      </div>
    );
  }

  const totalBytes = stats?.total_bytes || 0;
  const imageBytes = stats?.files_by_type?.images?.bytes || 0;
  const audioBytes = stats?.files_by_type?.audio?.bytes || 0;
  const docsBytes = stats?.files_by_type?.documents?.bytes || 0;
  const otherBytes = stats?.files_by_type?.other?.bytes || 0;

  const imagePct = totalBytes > 0 ? Math.round((imageBytes / totalBytes) * 100) : 0;
  const audioPct = totalBytes > 0 ? Math.round((audioBytes / totalBytes) * 100) : 0;
  const docsPct = totalBytes > 0 ? Math.round((docsBytes / totalBytes) * 100) : 0;
  const otherPct = totalBytes > 0 ? Math.max(0, 100 - imagePct - audioPct - docsPct) : 0;

  return (
    <div className="flex flex-col gap-6 text-zinc-100">
      
      {/* Top Banner & Quick Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">S3 Object Storage Telemetry</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Live Storage Gateway
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Authoritative file volume and bucket consumption queried from PostgreSQL & Object Storage backend.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadStorageStats}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Stats</span>
        </button>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Bucket Size */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Total Bucket Size</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-white tracking-tight">
              {stats?.total_size_formatted || '0 Bytes'}
            </p>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {(stats?.total_bytes || 0).toLocaleString()} raw bytes
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Bucket Target</span>
            <span className="font-mono text-indigo-400 font-semibold">{stats?.bucket || 'chatapp'}</span>
          </div>
        </div>

        {/* Card 2: Number of Files */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Number of Files</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <FolderArchive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-white tracking-tight">
              {(stats?.total_files || 0).toLocaleString()}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Indexed in PostgreSQL uploads
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Physical Disk Files</span>
            <span className="font-mono text-amber-400 font-semibold">{stats?.disk_files_count ?? 0}</span>
          </div>
        </div>

        {/* Card 3: Storage Engine */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Storage Backend</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-sm font-bold text-white line-clamp-1">
              {stats?.engine || 'S3 Object Storage'}
            </p>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate" title={stats?.endpoint}>
              {stats?.endpoint || 'http://localhost:9000'}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Region</span>
            <span className="font-mono text-emerald-400 font-semibold">{stats?.region || 'us-east-1'}</span>
          </div>
        </div>

        {/* Card 4: Volume Disk Mirror */}
        <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Disk Volume Consumption</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-extrabold text-white tracking-tight">
              {stats?.disk_size_formatted || '0 Bytes'}
            </p>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {(stats?.disk_bytes || 0).toLocaleString()} bytes on disk
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Quota Status</span>
            <span className="text-emerald-400 font-semibold">Healthy (Unrestricted)</span>
          </div>
        </div>
      </div>

      {/* Storage Breakdown by MIME Type */}
      <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              <span>Storage Consumption by Media Category</span>
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Breakdown of uploaded media across user conversations, avatars, and file transfers.
            </p>
          </div>
        </div>

        {/* Multi-segment Visual Progress Bar */}
        <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden flex shadow-inner">
          {imagePct > 0 && (
            <div
              style={{ width: `${imagePct}%` }}
              className="bg-indigo-500 h-full transition-all"
              title={`Images: ${imagePct}%`}
            />
          )}
          {audioPct > 0 && (
            <div
              style={{ width: `${audioPct}%` }}
              className="bg-rose-500 h-full transition-all"
              title={`Audio / Voice: ${audioPct}%`}
            />
          )}
          {docsPct > 0 && (
            <div
              style={{ width: `${docsPct}%` }}
              className="bg-amber-500 h-full transition-all"
              title={`Documents: ${docsPct}%`}
            />
          )}
          {otherPct > 0 && (
            <div
              style={{ width: `${otherPct}%` }}
              className="bg-emerald-500 h-full transition-all"
              title={`Other: ${otherPct}%`}
            />
          )}
        </div>

        {/* Breakdown Items Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          
          {/* Images */}
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-300">Images</p>
              <p className="text-xs font-bold text-white">
                {stats?.files_by_type?.images?.size_formatted || '0 Bytes'}
              </p>
              <p className="text-[10px] text-zinc-500">
                {stats?.files_by_type?.images?.count || 0} files ({imagePct}%)
              </p>
            </div>
          </div>

          {/* Audio / Voice */}
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-300">Voice & Audio</p>
              <p className="text-xs font-bold text-white">
                {stats?.files_by_type?.audio?.size_formatted || '0 Bytes'}
              </p>
              <p className="text-[10px] text-zinc-500">
                {stats?.files_by_type?.audio?.count || 0} voice notes ({audioPct}%)
              </p>
            </div>
          </div>

          {/* Documents */}
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-300">Documents & PDFs</p>
              <p className="text-xs font-bold text-white">
                {stats?.files_by_type?.documents?.size_formatted || '0 Bytes'}
              </p>
              <p className="text-[10px] text-zinc-500">
                {stats?.files_by_type?.documents?.count || 0} docs ({docsPct}%)
              </p>
            </div>
          </div>

          {/* Other Files */}
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-300">Other Binaries</p>
              <p className="text-xs font-bold text-white">
                {stats?.files_by_type?.other?.size_formatted || '0 Bytes'}
              </p>
              <p className="text-[10px] text-zinc-500">
                {stats?.files_by_type?.other?.count || 0} files ({otherPct}%)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* S3 Configuration & Connection Details Box */}
      <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-bold text-white">S3 Object Storage Parameters (Backend Only)</h4>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">Server-Side Credentials Secure</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-zinc-400 font-medium">S3 Endpoint URL</p>
              <p className="font-mono text-white font-semibold mt-0.5">{stats?.endpoint || 'http://localhost:9000'}</p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(stats?.endpoint || 'http://localhost:9000', 'endpoint')}
              className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              title="Copy endpoint"
            >
              {copiedKey === 'endpoint' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-zinc-400 font-medium">S3 Target Bucket</p>
              <p className="font-mono text-white font-semibold mt-0.5">{stats?.bucket || 'chatapp'}</p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(stats?.bucket || 'chatapp', 'bucket')}
              className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              title="Copy bucket name"
            >
              {copiedKey === 'bucket' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-zinc-400 font-medium">S3 Region</p>
              <p className="font-mono text-white font-semibold mt-0.5">{stats?.region || 'us-east-1'}</p>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Standard S3 SigV4</span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-zinc-400 font-medium">MinIO Web Management Console</p>
              <p className="font-mono text-indigo-400 font-semibold mt-0.5">http://localhost:9001</p>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Port 9001</span>
          </div>
        </div>
      </div>

      {/* Recent Uploaded Files Table */}
      <div className="p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h4 className="text-sm font-bold text-white">Recent Uploaded Files in Storage</h4>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {stats?.recent_files?.length || 0} recent files displayed
          </span>
        </div>

        {(!stats?.recent_files || stats.recent_files.length === 0) ? (
          <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
            <HardDrive className="w-6 h-6 text-zinc-600" />
            <span>No files uploaded yet in the object storage.</span>
            <span className="text-[11px] text-zinc-600">
              When users share images, documents, or voice notes in chats, they will appear here with real storage sizes.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-800/50 text-zinc-400 uppercase tracking-wider text-[10px] font-semibold border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">MIME Type</th>
                  <th className="py-2.5 px-3">Uploaded By</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {stats.recent_files.map((file) => (
                  <tr key={file.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-white max-w-xs truncate" title={file.filename}>
                      <div className="flex items-center gap-2">
                        {file.mime_type.startsWith('image/') ? (
                          <ImageIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        ) : file.mime_type.startsWith('audio/') ? (
                          <Mic className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="truncate">{file.filename}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-zinc-300">
                      {file.size_formatted}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">
                      {file.mime_type}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="w-3 h-3 text-zinc-500" />
                        <span>@{file.uploaded_by_username}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">
                      {new Date(file.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {file.public_url ? (
                        <a
                          href={file.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
