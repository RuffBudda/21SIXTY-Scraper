'use client';

import { useState, useEffect } from 'react';
import { formatToJSON, formatToCSV, formatToTXT } from '@/lib/formatters';
import { ProfileData } from '@/lib/types';
import N8NInstructions from '@/components/N8NInstructions';

type TabType = 'scrape' | 'webhook';

const AUTH_USERNAME = 'abubakr';
const AUTH_PASSWORD = 'M@0ZD0ng';

interface LinkedInStats {
  count: number;
  limit: number;
  remaining: number;
  month: string;
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('scrape');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkedInStats, setLinkedInStats] = useState<LinkedInStats | null>(null);

  // Webhook panel state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookRequest, setWebhookRequest] = useState<any>(null);
  const [webhookResponse, setWebhookResponse] = useState<any>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  // Get current deployment URL on mount
  useEffect(() => {
    const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
    setWebhookUrl(`${currentUrl}/api/scrape`);
    
    // Check if already authenticated (stored in sessionStorage)
    const authStatus = typeof window !== 'undefined' ? sessionStorage.getItem('authenticated') : null;
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Fetch LinkedIn stats periodically
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/linkedin-stats');
        const data = await response.json();
        if (data.success) {
          setLinkedInStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch LinkedIn stats:', err);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('authenticated', 'true');
      }
    } else {
      setAuthError('Invalid username or password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('authenticated');
    }
    setUsername('');
    setPassword('');
  };

  const handleScrape = async () => {
    if (!linkedInUrl.trim()) {
      setError('Please enter a profile or website URL');
      return;
    }

    setScraping(true);
    setError(null);
    setScrapedData(null);

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: linkedInUrl }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // Response is not JSON (likely HTML error page from Vercel timeout)
        const text = await response.text();
        throw new Error(`Server error (${response.status}): ${response.status === 504 ? 'Request timeout - the scraping took too long. Please try again or use a simpler profile.' : 'Unexpected response format'}`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape profile');
      }

      if (data.success && data.data) {
        setScrapedData(data.data);
        
        // Update LinkedIn stats from response headers
        const linkedInCount = response.headers.get('X-LinkedIn-Monthly-Count');
        const linkedInLimit = response.headers.get('X-LinkedIn-Monthly-Limit');
        const linkedInRemaining = response.headers.get('X-LinkedIn-Monthly-Remaining');
        
        if (linkedInCount && linkedInLimit && linkedInRemaining) {
          setLinkedInStats({
            count: parseInt(linkedInCount),
            limit: parseInt(linkedInLimit),
            remaining: parseInt(linkedInRemaining),
            month: new Date().toISOString().substring(0, 7), // YYYY-MM
          });
        }
      } else {
        throw new Error(data.error || 'No data received');
      }
    } catch (err: any) {
      // Handle JSON parsing errors specifically
      if (err instanceof SyntaxError && err.message.includes('JSON')) {
        setError('Server returned invalid response. This may be due to a timeout. Please try again.');
      } else {
        setError(err.message || 'An error occurred while scraping');
      }
    } finally {
      setScraping(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!linkedInUrl.trim()) {
      setError('Please enter a profile or website URL');
      return;
    }

    setWebhookLoading(true);
    setError(null);
    setWebhookRequest(null);
    setWebhookResponse(null);

    const requestData = {
      method: 'POST',
      url: webhookUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        url: linkedInUrl,
      },
    };

    setWebhookRequest(requestData);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: linkedInUrl }),
      });

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      let data;
      if (!contentType || !contentType.includes('application/json')) {
        // Response is not JSON (likely HTML error page from Vercel timeout)
        const text = await response.text();
        data = {
          success: false,
          error: `Server error (${response.status}): ${response.status === 504 ? 'Request timeout - the scraping took too long' : 'Unexpected response format'}`,
          rawResponse: text.substring(0, 200),
        };
      } else {
        data = await response.json();
      }

      setWebhookResponse({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
      });

      if (response.ok && data.success && data.data) {
        setScrapedData(data.data);
      }
    } catch (err: any) {
      setWebhookResponse({
        error: err.message || 'An error occurred',
      });
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleDownload = (format: 'json' | 'csv' | 'txt') => {
    if (!scrapedData) return;

    let content = '';
    let mimeType = '';
    let filename = '';

    switch (format) {
      case 'json':
        content = formatToJSON(scrapedData);
        mimeType = 'application/json';
        filename = `${scrapedData.platform}-profile.json`;
        break;
      case 'csv':
        content = formatToCSV(scrapedData);
        mimeType = 'text/csv';
        filename = `${scrapedData.platform}-profile.csv`;
        break;
      case 'txt':
        content = formatToTXT(scrapedData);
        mimeType = 'text/plain';
        filename = `${scrapedData.platform}-profile.txt`;
        break;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };


  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
              21SIXTY SCRAPER
            </h1>
            <p className="text-gray-400">Please login to continue</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-linkedin focus:border-transparent text-gray-100 placeholder-gray-500 transition-all"
                placeholder="Enter username"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-linkedin focus:border-transparent text-gray-100 placeholder-gray-500 transition-all"
                placeholder="Enter password"
                required
              />
            </div>
            
            {authError && (
              <div className="bg-red-950/50 border border-red-800/50 text-red-300 px-4 py-3 rounded-lg">
                {authError}
              </div>
            )}
            
            <button
              type="submit"
              className="w-full px-8 py-3 bg-linkedin text-white font-semibold rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-lg shadow-linkedin/20 hover:shadow-linkedin/30"
            >
              Login
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-7xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center justify-center gap-4 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/logos/logo.png" 
                alt="21SIXTY SCRAPER Logo" 
                className="h-20 w-20 rounded-xl shadow-lg" 
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }} 
              />
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                21SIXTY SCRAPER
              </h1>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-gray-600"
            >
              Logout
            </button>
          </div>
          <div className="flex items-center justify-center gap-4 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/logos/logo.png" 
              alt="21SIXTY SCRAPER Logo" 
              className="h-20 w-20 rounded-xl shadow-lg" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }} 
            />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              21SIXTY SCRAPER
            </h1>
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Scrape LinkedIn profiles, Instagram profiles, and websites with ease. Export to JSON, CSV, or TXT.
          </p>
        </header>

        {/* LinkedIn Monthly Limit Progress Bar */}
        {linkedInStats && (
          <div className="mb-8 bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-300">
                LinkedIn Monthly Scrape Limit
              </h3>
              <span className="text-sm text-gray-400">
                {linkedInStats.count} / {linkedInStats.limit} used
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-4 mb-2">
              <div
                className={`h-4 rounded-full transition-all duration-300 ${
                  linkedInStats.remaining > 20
                    ? 'bg-green-500'
                    : linkedInStats.remaining > 10
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{
                  width: `${(linkedInStats.count / linkedInStats.limit) * 100}%`,
                }}
              />
            </div>
            <p className="text-sm text-gray-400">
              {linkedInStats.remaining} scrapes remaining this month ({linkedInStats.month})
            </p>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('scrape')}
              className={`flex-1 py-5 px-6 text-center font-semibold text-base transition-all duration-200 relative ${
                activeTab === 'scrape'
                  ? 'text-linkedin'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Direct Scrape
              {activeTab === 'scrape' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-linkedin" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('webhook')}
              className={`flex-1 py-5 px-6 text-center font-semibold text-base transition-all duration-200 relative ${
                activeTab === 'webhook'
                  ? 'text-linkedin'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Webhook API
              {activeTab === 'webhook' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-linkedin" />
              )}
            </button>
          </div>

          <div className="p-8">
            {activeTab === 'scrape' ? (
              /* Direct Scrape Panel */
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300 mb-3">
                    Profile/Website URL <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={linkedInUrl}
                      onChange={(e) => setLinkedInUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !scraping && linkedInUrl.trim()) {
                          e.preventDefault();
                          handleScrape();
                        }
                      }}
                      placeholder="https://www.linkedin.com/in/example or https://instagram.com/username or https://example.com"
                      className="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-linkedin focus:border-transparent text-gray-100 placeholder-gray-500 transition-all"
                    />
                    <button
                      onClick={handleScrape}
                      disabled={scraping}
                      className="px-8 py-3 bg-linkedin text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-linkedin/20 hover:shadow-linkedin/30"
                    >
                      {scraping ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin">⏳</span>
                          Scraping...
                        </span>
                      ) : (
                        'Scrape'
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-950/50 border border-red-800/50 text-red-300 px-5 py-4 rounded-lg flex items-center gap-3">
                    <span className="text-xl">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {scrapedData && (
                  <div className="space-y-5">
                    <div className="bg-green-950/30 border border-green-800/50 text-green-300 px-5 py-4 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">✓</span>
                        <span>
                          Profile scraped successfully! Platform: <strong className="font-bold">{scrapedData.platform.toUpperCase()}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 max-h-[500px] overflow-y-auto">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {formatToJSON(scrapedData)}
                      </pre>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleDownload('json')}
                        className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-gray-600"
                      >
                        Download JSON
                      </button>
                      <button
                        onClick={() => handleDownload('csv')}
                        className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-gray-600"
                      >
                        Download CSV
                      </button>
                      <button
                        onClick={() => handleDownload('txt')}
                        className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-gray-600"
                      >
                        Download TXT
                      </button>
                      {scrapedData.platform === 'linkedin' && (
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch('/api/export-profile', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ profile: scrapedData }),
                              });
                              const data = await response.json();
                              if (data.success) {
                                await navigator.clipboard.writeText(data.code);
                                alert('Static profile code copied to clipboard! Paste it into lib/staticProfiles.ts');
                              } else {
                                alert('Error: ' + data.error);
                              }
                            } catch (err: any) {
                              alert('Error exporting profile: ' + err.message);
                            }
                          }}
                          className="px-5 py-2.5 bg-green-800 hover:bg-green-700 text-white font-medium rounded-lg transition-all duration-200 border border-green-700 hover:border-green-600"
                          title="Export as static profile code (for lib/staticProfiles.ts)"
                        >
                          Export as Static Profile
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Webhook Panel */
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300 mb-3">
                    Webhook URL
                  </label>
                  <input
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-linkedin focus:border-transparent text-gray-100 placeholder-gray-500 transition-all font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-300 mb-3">
                    Profile/Website URL
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={linkedInUrl}
                      onChange={(e) => setLinkedInUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !webhookLoading && linkedInUrl.trim()) {
                          e.preventDefault();
                          handleTestWebhook();
                        }
                      }}
                      placeholder="https://www.linkedin.com/in/example or https://instagram.com/username or https://example.com"
                      className="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-linkedin focus:border-transparent text-gray-100 placeholder-gray-500 transition-all"
                    />
                    <button
                      onClick={handleTestWebhook}
                      disabled={webhookLoading}
                      className="px-8 py-3 bg-linkedin text-white font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-linkedin/20 hover:shadow-linkedin/30"
                    >
                      {webhookLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin">⏳</span>
                          Testing...
                        </span>
                      ) : (
                        'Test Webhook'
                      )}
                    </button>
                  </div>
                </div>

                {webhookRequest && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-gray-300">
                        Request
                      </label>
                      <button
                        onClick={() => handleCopyToClipboard(JSON.stringify(webhookRequest, null, 2))}
                        className="text-sm text-linkedin hover:text-blue-400 font-medium transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 max-h-72 overflow-y-auto">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {JSON.stringify(webhookRequest, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {webhookResponse && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-gray-300">
                        Response
                      </label>
                      <button
                        onClick={() => handleCopyToClipboard(JSON.stringify(webhookResponse, null, 2))}
                        className="text-sm text-linkedin hover:text-blue-400 font-medium transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-5 max-h-96 overflow-y-auto">
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {JSON.stringify(webhookResponse, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* N8N Instructions */}
                <N8NInstructions webhookUrl={webhookUrl} />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
