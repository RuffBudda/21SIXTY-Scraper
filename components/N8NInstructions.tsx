'use client';

import { useState } from 'react';

interface N8NInstructionsProps {
  webhookUrl: string;
  apiKey: string;
}

export default function N8NInstructions({ webhookUrl, apiKey }: N8NInstructionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const workflowExample = {
    name: '21 SIXTY Scrapper',
    nodes: [
      {
        parameters: {},
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        position: [240, 300],
      },
      {
        parameters: {
          method: 'POST',
          url: webhookUrl,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: 'X-API-Key',
                value: apiKey || 'your-api-key-here',
              },
              {
                name: 'Content-Type',
                value: 'application/json',
              },
            ],
          },
          sendBody: true,
          contentType: 'json',
          bodyParameters: {
            parameters: [
              {
                name: 'url',
                value: 'https://www.linkedin.com/in/example',
              },
            ],
          },
        },
        name: 'Scrape Profile',
        type: 'n8n-nodes-base.httpRequest',
        position: [460, 300],
      },
    ],
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Scrape Profile', type: 'main', index: 0 }]],
      },
    },
  };

  return (
    <div className="mt-8 border-t border-gray-800 pt-8">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left font-bold text-lg text-gray-200 hover:text-linkedin transition-colors group"
      >
        <span className="flex items-center gap-3">
          <span className="text-2xl">📚</span>
          <span>N8N Webhook Setup Instructions</span>
        </span>
        <span className="text-2xl text-gray-500 group-hover:text-linkedin transition-transform duration-200">
          {isExpanded ? '−' : '+'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-8 space-y-6 text-gray-300">
          {/* Prerequisites */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
            <h3 className="font-bold text-xl mb-4 text-gray-100">Prerequisites</h3>
            <ul className="list-disc list-inside space-y-2 ml-2 text-gray-400">
              <li>Active N8N instance (cloud or self-hosted)</li>
              <li>API key from your Vercel deployment environment variables</li>
              <li>URL to scrape (LinkedIn profile, Instagram profile, or any website)</li>
            </ul>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-4">
            <h3 className="font-bold text-xl text-gray-100 mb-4">Step-by-Step Configuration</h3>
            
            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 1: Create New Workflow</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>Open your N8N dashboard</li>
                <li>Click the <strong className="text-gray-200">"New Workflow"</strong> button in the top right corner</li>
                <li>Name your workflow (e.g., "Profile Scraper")</li>
              </ol>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 2: Add HTTP Request Node</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>In the node palette on the left, search for <strong className="text-gray-200">"HTTP Request"</strong></li>
                <li>Drag and drop the <strong className="text-gray-200">"HTTP Request"</strong> node into the workflow canvas</li>
                <li>Click on the node to open its configuration panel</li>
              </ol>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 3: Configure HTTP Method and URL</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>Set <strong className="text-gray-200">"Method"</strong> to <code className="bg-gray-800 px-2 py-1 rounded text-blue-300">POST</code></li>
                <li>Set <strong className="text-gray-200">"URL"</strong> to:</li>
              </ol>
              <div className="mt-3 p-3 bg-gray-900 rounded-lg border border-gray-700">
                <code className="text-sm text-cyan-300 break-all">{webhookUrl}</code>
              </div>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 4: Add Authentication Header</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>Scroll down to <strong className="text-gray-200">"Headers"</strong> section</li>
                <li>Click <strong className="text-gray-200">"Add Header"</strong> button</li>
                <li>Set <strong className="text-gray-200">"Name"</strong> to: <code className="bg-gray-800 px-2 py-1 rounded text-blue-300">X-API-Key</code></li>
                <li>Set <strong className="text-gray-200">"Value"</strong> to your API key</li>
                <li className="mt-3 text-sm text-gray-400">💡 <strong>Tip:</strong> For security, use N8N credentials feature to store your API key securely</li>
              </ol>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 5: Configure Request Body</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>Scroll to <strong className="text-gray-200">"Send Body"</strong> section</li>
                <li>Enable <strong className="text-gray-200">"Send Body"</strong> toggle</li>
                <li>Set <strong className="text-gray-200">"Content Type"</strong> to <code className="bg-gray-800 px-2 py-1 rounded text-blue-300">JSON</code></li>
                <li>In the body editor, enter one of:</li>
              </ol>
              <pre className="mt-3 p-4 bg-gray-900 rounded-lg border border-gray-700 text-sm text-gray-300 overflow-x-auto font-mono">
{`{
  "url": "https://www.linkedin.com/in/example"
}
// OR
{
  "url": "https://instagram.com/username"
}
// OR
{
  "url": "https://example.com"
}`}
              </pre>
              <p className="mt-3 text-sm text-gray-400">💡 <strong>Supported platforms:</strong> LinkedIn profiles, Instagram profiles, or any website URL</p>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 6: Add Trigger Node</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>Search for <strong className="text-gray-200">"Manual Trigger"</strong> or <strong className="text-gray-200">"Webhook"</strong> node</li>
                <li>Add it before the HTTP Request node</li>
                <li>Connect it to the HTTP Request node</li>
                <li>For <strong className="text-gray-200">Manual Trigger</strong>: Click "Execute Workflow" to test</li>
                <li>For <strong className="text-gray-200">Webhook</strong>: Copy the webhook URL to use in external systems</li>
              </ol>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 7: Handle Response Data</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>Add a <strong className="text-gray-200">"Set"</strong> node after the HTTP Request node</li>
                <li>Extract specific fields using expressions:
                  <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-sm text-gray-400">
                    <li>Profile name: <code className="bg-gray-800 px-1 rounded text-blue-300">{`{{ $json.data.name }}`}</code></li>
                    <li>Platform: <code className="bg-gray-800 px-1 rounded text-blue-300">{`{{ $json.data.platform }}`}</code></li>
                    <li>Check success: <code className="bg-gray-800 px-1 rounded text-blue-300">{`{{ $json.success }}`}</code></li>
                  </ul>
                </li>
              </ol>
            </div>

            <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
              <h4 className="font-bold text-lg mb-3 text-blue-300">Step 8: Error Handling</h4>
              <ol className="list-decimal list-inside space-y-2 ml-2 text-gray-300">
                <li>In the HTTP Request node, enable <strong className="text-gray-200">"Continue On Fail"</strong></li>
                <li>Add an <strong className="text-gray-200">"IF"</strong> node after the HTTP Request</li>
                <li>Check status code: <code className="bg-gray-800 px-2 py-1 rounded text-blue-300">{`{{ $json.statusCode }}`}</code></li>
                <li>Branch on success (200) vs errors (401, 429, 500)</li>
                <li>Add error notification or retry logic as needed</li>
              </ol>
            </div>
          </div>

          {/* Complete Workflow JSON */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
            <h3 className="font-bold text-xl mb-4 text-gray-100">Complete Workflow JSON Example</h3>
            <p className="text-sm mb-3 text-gray-400">Copy this JSON and import it into N8N:</p>
            <div className="relative">
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(workflowExample, null, 2))}
                className="absolute top-3 right-3 px-4 py-2 bg-linkedin text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-lg"
              >
                Copy JSON
              </button>
              <pre className="bg-gray-900 p-5 rounded-lg overflow-x-auto text-xs max-h-96 overflow-y-auto border border-gray-700 font-mono text-gray-300 leading-relaxed">
                {JSON.stringify(workflowExample, null, 2)}
              </pre>
            </div>
            <p className="text-sm mt-3 text-gray-400">
              💡 To import: In N8N, click the three dots menu → "Import from File" → Paste this JSON
            </p>
          </div>

          {/* Expression Examples */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
            <h3 className="font-bold text-xl mb-4 text-gray-100">N8N Expression Examples</h3>
            <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-700">
              <div>
                <strong className="text-gray-200">Get platform type:</strong>
                <code className="block mt-2 bg-gray-950 px-3 py-2 rounded text-blue-300 font-mono text-sm">{`{{ $json.data.platform }}`}</code>
              </div>
              <div>
                <strong className="text-gray-200">Get profile data:</strong>
                <code className="block mt-2 bg-gray-950 px-3 py-2 rounded text-blue-300 font-mono text-sm">{`{{ $json.data }}`}</code>
              </div>
              <div>
                <strong className="text-gray-200">Check if successful:</strong>
                <code className="block mt-2 bg-gray-950 px-3 py-2 rounded text-blue-300 font-mono text-sm">{`{{ $json.success }}`}</code>
              </div>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
            <h3 className="font-bold text-xl mb-4 text-gray-100">Troubleshooting</h3>
            <div className="space-y-4">
              <div className="bg-yellow-950/30 border border-yellow-800/50 p-4 rounded-lg">
                <h4 className="font-bold mb-2 text-yellow-300">401 Unauthorized</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-gray-300">
                  <li>Verify your API key is correct in the <code className="bg-gray-800 px-1 rounded text-yellow-300">X-API-Key</code> header</li>
                  <li>Check that the API key matches the one set in your Vercel environment variables</li>
                  <li>Ensure there are no extra spaces or characters in the header value</li>
                </ul>
              </div>

              <div className="bg-yellow-950/30 border border-yellow-800/50 p-4 rounded-lg">
                <h4 className="font-bold mb-2 text-yellow-300">429 Too Many Requests</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-gray-300">
                  <li>You've exceeded the rate limit (10 requests per minute per API key)</li>
                  <li>Add a delay node between requests in your workflow</li>
                  <li>Use N8N's queue feature to manage request frequency</li>
                  <li>Check the <code className="bg-gray-800 px-1 rounded text-yellow-300">Retry-After</code> header in the response</li>
                </ul>
              </div>

              <div className="bg-yellow-950/30 border border-yellow-800/50 p-4 rounded-lg">
                <h4 className="font-bold mb-2 text-yellow-300">Timeout Error</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-gray-300">
                  <li>Page may be taking too long to load</li>
                  <li>Increase the timeout setting in the HTTP Request node (default is usually 30 seconds)</li>
                  <li>Check if the URL is accessible</li>
                </ul>
              </div>

              <div className="bg-yellow-950/30 border border-yellow-800/50 p-4 rounded-lg">
                <h4 className="font-bold mb-2 text-yellow-300">Empty Response or Missing Data</h4>
                <ul className="list-disc list-inside space-y-1 ml-2 text-sm text-gray-300">
                  <li>Verify the URL format is correct</li>
                  <li>Check if the profile/page is public and accessible</li>
                  <li>Some sections may be private or unavailable</li>
                  <li>Review the response structure to see what data was returned</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Best Practices */}
          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-6">
            <h3 className="font-bold text-xl mb-4 text-gray-100">Best Practices</h3>
            <ul className="list-disc list-inside space-y-2 ml-2 text-gray-300">
              <li>Store your API key securely using N8N's credential management feature</li>
              <li>Implement rate limiting in your workflow to avoid hitting API limits</li>
              <li>Add error handling and retry logic for failed requests</li>
              <li>Use webhook nodes to trigger scrapes from external systems</li>
              <li>Monitor your API usage to stay within rate limits</li>
              <li>Cache results when possible to reduce API calls</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
