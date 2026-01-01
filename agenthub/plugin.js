/**
 * AgentHub - AI agents that live in your Thymer space
 *
 * Each agent is a page in the AgentHub collection.
 * System prompt in a toggle at top, chat below.
 * Links bring context into the conversation.
 */

class Plugin extends CollectionPlugin {

    async onLoad() {
        this.agents = new Map();
        this.commands = [];

        // Wait for SyncHub to be ready (provides markdown utilities)
        if (!window.syncHub) {
            window.addEventListener('synchub-ready', () => this.initialize(), { once: true });
            // Timeout fallback
            setTimeout(() => {
                if (!this.initialized) this.initialize();
            }, 2000);
        } else {
            this.initialize();
        }
    }

    async initialize() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('[AgentHub] Initializing' + (window.syncHub ? ' (SyncHub ready)' : ' (standalone)'));

        // Load agents and register commands
        await this.loadAgents();

        // Watch for AgentHub changes
        this.refreshInterval = setInterval(() => this.loadAgents(), 30000);
    }

    onUnload() {
        // Clean up commands (safety check in case onLoad didn't complete)
        if (this.commands) {
            for (const cmd of this.commands) {
                cmd.remove();
            }
            this.commands = [];
        }

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    // =========================================================================
    // Agent Loading
    // =========================================================================

    async loadAgents() {
        try {
            const collections = await this.data.getAllCollections();
            const agentHub = collections.find(c => c.getName() === 'AgentHub');

            if (!agentHub) {
                console.log('[AgentHub] Collection not found');
                return;
            }

            const records = await agentHub.getAllRecords();

            // Clear old commands
            for (const cmd of this.commands) {
                cmd.remove();
            }
            this.commands = [];
            this.agents.clear();

            // Register each enabled agent
            for (const record of records) {
                const enabled = record.prop('enabled')?.choice();
                if (enabled !== 'yes') continue;  // choice() returns ID, not label

                const name = record.getName();
                const command = record.text('command') || `@${name.toLowerCase().replace(/\s+/g, '-')}`;
                const provider = record.prop('provider')?.choice() || 'anthropic';
                const model = record.prop('model')?.choice() || 'sonnet';
                const customModel = record.text('custom_model');
                const customEndpoint = record.text('custom_endpoint');
                const token = record.text('token');

                console.log(`[AgentHub] Registering agent: ${name}, provider: ${provider}, model: ${model}, token: ${token ? 'yes' : 'no'}`);

                this.agents.set(record.guid, {
                    guid: record.guid,
                    name,
                    command,
                    provider,
                    model,
                    customModel,
                    customEndpoint,
                    token,
                });

                // Register command palette command
                const cmd = this.ui.addCommandPaletteCommand({
                    label: `Chat with ${name}`,
                    icon: 'robot',
                    onSelected: () => this.openAgentChat(record.guid),
                });
                this.commands.push(cmd);

                console.log(`[AgentHub] Registered: ${name} (${command})`);
            }
        } catch (e) {
            console.error('[AgentHub] Failed to load agents:', e);
        }
    }

    // =========================================================================
    // Chat Interface
    // =========================================================================

    async openAgentChat(agentGuid) {
        console.log('[AgentHub] openAgentChat called with:', agentGuid);
        // Navigate to agent page
        // For now, just trigger a completion on the current page
        await this.runCompletion(agentGuid);
    }

    async runCompletion(agentGuid) {
        console.log('[AgentHub] runCompletion started for:', agentGuid);

        const agent = this.agents.get(agentGuid);
        if (!agent) {
            console.error('[AgentHub] Agent not found in map:', agentGuid);
            console.log('[AgentHub] Available agents:', [...this.agents.keys()]);
            return;
        }
        console.log('[AgentHub] Found agent:', agent.name);

        // Get the agent record
        const collections = await this.data.getAllCollections();
        const agentHub = collections.find(c => c.getName() === 'AgentHub');
        const records = await agentHub.getAllRecords();
        const agentRecord = records.find(r => r.guid === agentGuid);

        if (!agentRecord) {
            console.error('[AgentHub] Agent record not found');
            return;
        }
        console.log('[AgentHub] Found record:', agentRecord.getName());

        // Set status to Thinking
        agentRecord.prop('status')?.setChoice('thinking');

        // Parse page content into system prompt and messages
        console.log('[AgentHub] Parsing page content...');
        const { systemPrompt, messages, linkedContent } = await this.parseAgentPage(agentRecord);
        console.log('[AgentHub] Parsed:', { systemPrompt: systemPrompt?.slice(0, 50), messageCount: messages.length, messages });

        if (messages.length === 0) {
            console.log('[AgentHub] No messages to process');
            agentRecord.prop('status')?.setChoice('idle');
            return;
        }

        // Get API key (agent-specific or from config)
        const apiKey = agent.token || await this.getSharedApiKey();
        console.log('[AgentHub] API key found:', apiKey ? 'yes (' + apiKey.slice(0, 10) + '...)' : 'no');

        if (!apiKey) {
            console.error('[AgentHub] No API key configured');
            agentRecord.prop('status')?.setChoice('error');
            agentRecord.prop('last_error')?.set('No API key configured');
            this.ui.addToaster({
                title: agent.name,
                message: 'No API key configured',
                dismissible: true,
                autoDestroyTime: 3000,
            });
            return;
        }

        // Build the full message array with linked content
        const fullMessages = this.buildMessages(messages, linkedContent);

        // Find the LAST item on the page to append after
        const allItems = await agentRecord.getLineItems();
        const topLevelItems = allItems.filter(item => item.parent_guid === agentRecord.guid);
        const lastItem = topLevelItems[topLevelItems.length - 1] || null;

        console.log('[AgentHub] Appending after last item:', lastItem?.guid);

        // Add blank line after last content
        const blankItem = await agentRecord.createLineItem(null, lastItem, 'text');
        blankItem?.setSegments([]);

        // Create streaming preview item (will be replaced with markdown)
        const previewItem = await agentRecord.createLineItem(null, blankItem, 'text');
        previewItem?.setSegments([
            { type: 'bold', text: `${agent.name}: ` },
            { type: 'text', text: '...' },
        ]);

        // Track the preview item guid so we can delete it later
        const previewGuid = previewItem?.guid;

        // Call Anthropic API with streaming
        try {
            const finalText = await this.callLLMStreaming(
                agent,
                apiKey,
                systemPrompt,
                fullMessages,
                (text) => {
                    // Update preview with streaming text (show last 500 chars for long responses)
                    const preview = text.length > 500 ? '...' + text.slice(-500) : text;
                    previewItem?.setSegments([
                        { type: 'bold', text: `${agent.name}: ` },
                        { type: 'text', text: preview },
                    ]);
                }
            );

            // Convert preview to just a label
            previewItem?.setSegments([
                { type: 'bold', text: `${agent.name}:` },
            ]);

            // Insert properly formatted markdown AFTER the label
            if (finalText && window.syncHub?.insertMarkdown) {
                await window.syncHub.insertMarkdown(finalText, agentRecord, previewItem);
            }

            // Update stats and set status back to Idle
            await this.updateAgentStats(agentRecord, agent.name);
            agentRecord.prop('status')?.setChoice('idle');

        } catch (e) {
            console.error('[AgentHub] API error:', e);
            agentRecord.prop('status')?.setChoice('error');
            agentRecord.prop('last_error')?.set(e.message);
            previewItem?.setSegments([
                { type: 'bold', text: `${agent.name}: ` },
                { type: 'text', text: `Error: ${e.message}` },
            ]);
        }
    }

    // =========================================================================
    // Page Parsing
    // =========================================================================

    async parseAgentPage(record) {
        const items = await record.getLineItems();

        let systemPrompt = '';
        const messages = [];
        const linkedContent = new Map();

        let inSystemPrompt = false;
        let currentRole = null;
        let currentContent = '';

        for (const item of items) {
            // Extract text from segments
            const text = (item.segments || []).map(s => s.text || '').join('');
            const isToggle = item.type === 'toggle';
            const parentGuid = item.parent_guid;

            // System prompt is in a toggle at the top level
            if (isToggle && parentGuid === record.guid && text.toLowerCase().includes('system')) {
                inSystemPrompt = true;
                continue;
            }

            // Content inside system prompt toggle
            if (inSystemPrompt && parentGuid !== record.guid) {
                systemPrompt += text + '\n';
                continue;
            }

            // Exited system prompt
            if (inSystemPrompt && parentGuid === record.guid) {
                inSystemPrompt = false;
            }

            // Parse chat messages
            // Format: "Me: message" or "Agent: message" or "[AgentName]: message"
            const meMatch = text.match(/^Me:\s*(.*)/i);
            const agentMatch = text.match(/^(?:Agent|[A-Z][a-z]+):\s*(.*)/);

            if (meMatch) {
                // Save previous message
                if (currentRole && currentContent) {
                    messages.push({ role: currentRole, content: currentContent.trim() });
                }
                currentRole = 'user';
                currentContent = meMatch[1];
            } else if (agentMatch && !meMatch) {
                // Save previous message
                if (currentRole && currentContent) {
                    messages.push({ role: currentRole, content: currentContent.trim() });
                }
                currentRole = 'assistant';
                currentContent = agentMatch[1];
            } else if (currentRole) {
                // Continuation of current message
                currentContent += '\n' + text;
            }

            // Extract linked content
            const links = this.extractLinks(text);
            for (const link of links) {
                if (!linkedContent.has(link.guid)) {
                    const content = await this.resolveLink(link.guid);
                    if (content) {
                        linkedContent.set(link.guid, { title: link.title, content });
                    }
                }
            }
        }

        // Don't forget the last message
        if (currentRole && currentContent) {
            messages.push({ role: currentRole, content: currentContent.trim() });
        }

        return { systemPrompt: systemPrompt.trim(), messages, linkedContent };
    }

    extractLinks(text) {
        // Match [[Page Name]] style links and block refs
        const links = [];
        // This is simplified - real implementation would parse Thymer's link format
        const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
        for (const match of matches) {
            links.push({ title: match[1], guid: null }); // Would need actual GUID resolution
        }
        return links;
    }

    async resolveLink(guid) {
        // Resolve a block/page GUID to its content
        // For now, return placeholder
        try {
            const collections = await this.data.getAllCollections();
            for (const collection of collections) {
                const records = await collection.getAllRecords();
                const record = records.find(r => r.guid === guid);
                if (record) {
                    const items = await record.getLineItems();
                    return items.map(i => (i.segments || []).map(s => s.text || '').join('')).join('\n');
                }
            }
        } catch (e) {
            console.error('[AgentHub] Failed to resolve link:', e);
        }
        return null;
    }

    buildMessages(messages, linkedContent) {
        // If there's linked content, prepend it to the first user message
        if (linkedContent.size > 0 && messages.length > 0) {
            let contextBlock = '---\nLinked Context:\n';
            for (const [guid, { title, content }] of linkedContent) {
                contextBlock += `\n## ${title}\n${content}\n`;
            }
            contextBlock += '---\n\n';

            // Find first user message and prepend context
            const firstUserIdx = messages.findIndex(m => m.role === 'user');
            if (firstUserIdx >= 0) {
                messages[firstUserIdx] = {
                    ...messages[firstUserIdx],
                    content: contextBlock + messages[firstUserIdx].content,
                };
            }
        }

        return messages;
    }

    // =========================================================================
    // Anthropic API (Streaming)
    // =========================================================================

    async callLLMStreaming(agent, apiKey, systemPrompt, messages, onChunk) {
        const { provider, model, customModel, customEndpoint } = agent;

        // Route to appropriate provider
        switch (provider) {
            case 'openai':
                return this.callOpenAIStreaming(apiKey, model, customModel, customEndpoint, systemPrompt, messages, onChunk);
            case 'ollama':
                return this.callOllamaStreaming(model, customModel, customEndpoint, systemPrompt, messages, onChunk);
            case 'custom':
                return this.callCustomStreaming(apiKey, customModel, customEndpoint, systemPrompt, messages, onChunk);
            case 'anthropic':
            default:
                return this.callAnthropicStreaming(apiKey, model, customModel, systemPrompt, messages, onChunk);
        }
    }

    async callAnthropicStreaming(apiKey, modelChoice, customModel, systemPrompt, messages, onChunk) {
        const modelMap = {
            'sonnet': 'claude-sonnet-4-5',
            'haiku': 'claude-haiku-4-5',
            'opus': 'claude-opus-4-5',
            'custom': customModel,
        };
        const model = modelMap[modelChoice] || customModel || 'claude-sonnet-4-5';

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                stream: true,
                system: systemPrompt || undefined,
                messages,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error ${response.status}: ${error}`);
        }

        return this.processAnthropicStream(response, onChunk);
    }

    async callOpenAIStreaming(apiKey, modelChoice, customModel, customEndpoint, systemPrompt, messages, onChunk) {
        const modelMap = {
            'gpt-4o': 'gpt-4o',
            'gpt-4o-mini': 'gpt-4o-mini',
            'custom': customModel,
        };
        const model = modelMap[modelChoice] || customModel || 'gpt-4o';
        const endpoint = customEndpoint || 'https://api.openai.com/v1/chat/completions';

        // Convert messages to OpenAI format (add system as first message)
        const openaiMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                stream: true,
                messages: openaiMessages,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error ${response.status}: ${error}`);
        }

        return this.processOpenAIStream(response, onChunk);
    }

    async callOllamaStreaming(modelChoice, customModel, customEndpoint, systemPrompt, messages, onChunk) {
        const model = customModel || modelChoice || 'llama3.2';
        const endpoint = customEndpoint || 'http://localhost:11434/api/chat';

        // Convert to Ollama format
        const ollamaMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                stream: true,
                messages: ollamaMessages,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Ollama API error ${response.status}: ${error}`);
        }

        return this.processOllamaStream(response, onChunk);
    }

    async callCustomStreaming(apiKey, customModel, customEndpoint, systemPrompt, messages, onChunk) {
        // Generic OpenAI-compatible endpoint
        if (!customEndpoint) throw new Error('Custom endpoint required');

        const customMessages = systemPrompt
            ? [{ role: 'system', content: systemPrompt }, ...messages]
            : messages;

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const response = await fetch(customEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: customModel || 'default',
                stream: true,
                messages: customMessages,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Custom API error ${response.status}: ${error}`);
        }

        // Try OpenAI format first (most common)
        return this.processOpenAIStream(response, onChunk);
    }

    // Stream processors
    async processAnthropicStream(response, onChunk) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.type === 'content_block_delta' && data.delta?.text) {
                            fullText += data.delta.text;
                            onChunk(fullText);
                        }
                    } catch (e) {}
                }
            }
        }
        return fullText;
    }

    async processOpenAIStream(response, onChunk) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullText += delta;
                            onChunk(fullText);
                        }
                    } catch (e) {}
                }
            }
        }
        return fullText;
    }

    async processOllamaStream(response, onChunk) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.message?.content) {
                        fullText += data.message.content;
                        onChunk(fullText);
                    }
                } catch (e) {}
            }
        }
        return fullText;
    }

    // =========================================================================
    // Response Formatting
    // =========================================================================

    formatResponse(agentName, text) {
        // Build segments with agent name prefix + formatted text
        const segments = [
            { type: 'bold', text: `${agentName}: ` },
        ];

        // Use SyncHub's parseMarkdown to get formatted segments
        if (window.syncHub?.parseMarkdown) {
            const blocks = window.syncHub.parseMarkdown(text);
            // Flatten all block segments into one line (for simple responses)
            for (const block of blocks) {
                if (block.segments) {
                    segments.push(...block.segments);
                }
            }
        } else {
            segments.push({ type: 'text', text });
        }

        return segments;
    }

    // =========================================================================
    // Stats
    // =========================================================================

    async updateAgentStats(record, agentName) {
        try {
            const count = record.prop('invocations')?.number() || 0;
            record.prop('invocations')?.set(count + 1);

            // Use SyncHub's setLastRun if available, otherwise fallback
            if (window.syncHub?.setLastRun) {
                window.syncHub.setLastRun(record);
            } else if (typeof DateTime !== 'undefined') {
                record.prop('last_run')?.set(new DateTime(new Date()).value());
            }

            // Log to journal if available
            if (window.syncHub?.logToJournal && agentName) {
                await window.syncHub.logToJournal([{
                    verb: 'chatted with',
                    title: agentName,
                    guid: record.guid,
                    major: false,
                }], 'verbose');
            }
        } catch (e) {
            // Stats update is non-critical
        }
    }

    async getSharedApiKey() {
        // Look for shared API key in AgentHub config record or SyncHub
        try {
            const collections = await this.data.getAllCollections();

            // Check SyncHub for agenthub config
            const syncHub = collections.find(c => c.getName() === 'Sync Hub');
            if (syncHub) {
                const records = await syncHub.getAllRecords();
                const config = records.find(r => r.text('plugin_id') === 'agenthub');
                if (config) {
                    return config.text('token');
                }
            }
        } catch (e) {
            console.error('[AgentHub] Failed to get shared API key:', e);
        }
        return null;
    }
}
