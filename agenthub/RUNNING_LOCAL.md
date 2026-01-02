# Running Local AI Models for Browser Apps

This guide explains how to run a local LLM on your Mac that can be called from a web application hosted on a different domain. This is non-trivial because browsers enforce CORS (Cross-Origin Resource Sharing) and block mixed content (HTTPS pages calling HTTP APIs).

## The Challenge

When your webapp at `https://example.com` tries to call your local LLM at `http://192.168.1.100:8080`:

1. **Mixed Content Block**: Browsers block HTTPS pages from making HTTP requests
2. **CORS Block**: Browsers block requests to different origins without proper headers
3. **No Valid SSL**: You can't get a real SSL certificate for a private IP address

## The Solution: Cloudflare DNS-01 Challenge

The trick is to use **Cloudflare's DNS API** to get a real Let's Encrypt certificate for your local machine, even though it has a private IP.

### How It Works

1. Create a DNS A record pointing to your private IP: `mlx.yourdomain.com → 192.168.1.100`
2. Use Caddy with the Cloudflare DNS plugin
3. Caddy proves domain ownership via DNS TXT records (not HTTP), so Let's Encrypt never needs to reach your server
4. You get a valid SSL certificate for your local machine!

### Prerequisites

- A domain on Cloudflare (free tier works)
- Mac with Apple Silicon (for MLX) or any machine (for Ollama)
- Homebrew installed

---

## Option 1: MLX Setup (Best for Apple Silicon)

MLX is Apple's machine learning framework, optimized for M-series chips. Expect ~30-50 tokens/sec on M2 Ultra.

### Step 1: Install Dependencies

```bash
# Install Python packages
pip3 install mlx mlx-lm

# Build Caddy with Cloudflare DNS support
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
cd ~/.local/bin
~/go/bin/xcaddy build --with github.com/caddy-dns/cloudflare
```

### Step 2: Download a Model

```bash
mkdir -p ~/.local/llama-models
cd ~/.local/llama-models

# Download Qwen 2.5 32B (recommended for tool calling)
hf download mlx-community/Qwen2.5-32B-Instruct-4bit --local-dir Qwen2.5-32B-MLX

# Or Mistral Small 24B (faster, but may have tokenizer issues)
hf download mlx-community/Mistral-Small-24B-Instruct-2501-4bit --local-dir Mistral-Small-24B-MLX
```

### Step 3: Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Set permissions: Zone → DNS → Edit
5. Set zone: Include → Specific zone → yourdomain.com
6. Save the token

### Step 4: Add DNS Record

In Cloudflare dashboard:
1. Go to your domain → DNS
2. Add A record: `mlx` → `192.168.1.100` (your Mac's local IP)
3. Set to "DNS only" (gray cloud), not proxied

### Step 5: Create Caddyfile

Create `~/.local/llama-models/Caddyfile`:

```caddyfile
# Global options - Cloudflare DNS challenge for SSL
{
    acme_dns cloudflare YOUR_CLOUDFLARE_API_TOKEN
}

mlx.yourdomain.com:8080 {
    # Handle CORS preflight requests
    @cors_preflight {
        method OPTIONS
    }

    handle @cors_preflight {
        header {
            Access-Control-Allow-Origin "https://your-webapp.com"
            Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
            Access-Control-Allow-Headers "Content-Type, Authorization"
            Access-Control-Max-Age "3600"
        }
        respond 204
    }

    # Proxy to MLX server
    reverse_proxy localhost:8081 {
        # Strip upstream CORS headers (MLX adds conflicting ones)
        header_down -Access-Control-Allow-Origin
        header_down -Access-Control-Allow-Methods
        header_down -Access-Control-Allow-Headers
        header_down -Access-Control-Allow-Credentials
    }

    # Add CORS headers to all responses
    header {
        Access-Control-Allow-Origin "https://your-webapp.com"
        Access-Control-Allow-Credentials "true"
    }

    log {
        output file ~/.local/llama-models/caddy-access.log
        format json
    }
}
```

### Step 6: Create Startup Scripts

**MLX Server** (`~/.local/bin/mlx-server-start.sh`):

```bash
#!/bin/bash
MODEL_PATH="$HOME/.local/llama-models/Qwen2.5-32B-MLX"
HOST="127.0.0.1"
PORT="8081"
MAX_TOKENS=4096

cd "$MODEL_PATH"
exec mlx_lm.server \
  --model "$MODEL_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  --max-tokens "$MAX_TOKENS" 2>&1 | tee -a "$HOME/.local/llama-models/mlx-server.log"
```

**Caddy Proxy** (`~/.local/bin/caddy-start.sh`):

```bash
#!/bin/bash
CADDYFILE="$HOME/.local/llama-models/Caddyfile"

exec ~/.local/bin/caddy run \
  --config "$CADDYFILE" \
  --adapter caddyfile 2>&1 | tee -a "$HOME/.local/llama-models/caddy.log"
```

Make them executable:

```bash
chmod +x ~/.local/bin/mlx-server-start.sh ~/.local/bin/caddy-start.sh
```

### Step 7: Start Services

```bash
# Start MLX server (in one terminal)
~/.local/bin/mlx-server-start.sh

# Start Caddy (in another terminal)
~/.local/bin/caddy-start.sh
```

### Step 8: Test

```bash
# Test the endpoint
curl https://mlx.yourdomain.com:8080/v1/models

# Test chat completion
curl -X POST https://mlx.yourdomain.com:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Qwen2.5-32B-Instruct-4bit",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Option 2: Ollama Setup (Simpler, Cross-Platform)

Ollama is easier to set up but slightly slower on Apple Silicon compared to MLX.

### Step 1: Install Ollama

```bash
brew install ollama
```

### Step 2: Pull a Model

```bash
ollama pull qwen2.5:32b
# Or for faster inference:
ollama pull qwen2.5:14b
```

### Step 3: Configure CORS

Ollama has built-in CORS support via environment variable:

```bash
export OLLAMA_ORIGINS="https://your-webapp.com"
```

### Step 4: Start Ollama

```bash
OLLAMA_ORIGINS="https://your-webapp.com" ollama serve
```

Ollama serves on `http://localhost:11434` by default.

### Step 5: Add Caddy for HTTPS

You still need Caddy for HTTPS. Create `~/.local/llama-models/Caddyfile-ollama`:

```caddyfile
{
    acme_dns cloudflare YOUR_CLOUDFLARE_API_TOKEN
}

ollama.yourdomain.com:8080 {
    reverse_proxy localhost:11434

    log {
        output file ~/.local/llama-models/caddy-ollama.log
        format json
    }
}
```

Note: Ollama handles CORS itself, so no need for header manipulation in Caddy.

### Step 6: Test

```bash
curl https://ollama.yourdomain.com:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:32b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Auto-Start on Boot (macOS)

### Create LaunchAgent for MLX

Create `~/Library/LaunchAgents/com.user.mlx-server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.mlx-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.local/bin/mlx-server-start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.local/llama-models/launchd-mlx.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.local/llama-models/launchd-mlx-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/YOUR_USERNAME/.pyenv/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

### Create LaunchAgent for Caddy

Create `~/Library/LaunchAgents/com.user.caddy-proxy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.caddy-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/.local/bin/caddy-start.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.local/llama-models/launchd-caddy.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.local/llama-models/launchd-caddy-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

### Load the Services

```bash
launchctl load ~/Library/LaunchAgents/com.user.mlx-server.plist
launchctl load ~/Library/LaunchAgents/com.user.caddy-proxy.plist
```

---

## Using with AgentHub

Once your local endpoint is running with HTTPS, configure an AgentHub agent to use it.

### MLX Agent Configuration

In your AgentHub collection, create a new agent record:

| Field | Value |
|-------|-------|
| Name | `Qwen Local` |
| Command | `@qwen` |
| Enabled | `Yes` |
| Provider | `Custom` |
| Model | `Custom` |
| Custom Model | `mlx-community/Qwen2.5-32B-Instruct-4bit` |
| Custom Endpoint | `https://mlx.yourdomain.com:8080/v1/chat/completions` |
| API Key | *(leave empty - local server doesn't need auth)* |

### Ollama Agent Configuration

| Field | Value |
|-------|-------|
| Name | `Llama Local` |
| Command | `@llama` |
| Enabled | `Yes` |
| Provider | `Custom` |
| Model | `Custom` |
| Custom Model | `qwen2.5:32b` |
| Custom Endpoint | `https://ollama.yourdomain.com:8080/v1/chat/completions` |

### Testing

1. Open any page in Thymer
2. Type a test message: `Hello, are you running locally?`
3. Open Command Palette (Cmd+K)
4. Select "Chat with Qwen Local"
5. Watch your local server logs to confirm it's handling the request

### Debugging with curl

If AgentHub isn't connecting, test your endpoint directly:

```bash
# Test the endpoint
curl https://mlx.yourdomain.com:8080/v1/models

# Test chat completion
curl -X POST https://mlx.yourdomain.com:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mlx-community/Qwen2.5-32B-Instruct-4bit",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Troubleshooting

### "502 Bad Gateway"
The MLX/Ollama server crashed or isn't running. Restart it:
```bash
pkill -f "mlx_lm.server"
~/.local/bin/mlx-server-start.sh
```

### "CORS error: multiple values"
The upstream server (MLX) is adding its own CORS headers. Make sure Caddy strips them:
```caddyfile
reverse_proxy localhost:8081 {
    header_down -Access-Control-Allow-Origin
    header_down -Access-Control-Allow-Methods
    header_down -Access-Control-Allow-Headers
}
```

### "Mixed Content" error
Your Caddy isn't serving HTTPS. Check:
1. DNS record exists and points to your local IP
2. Cloudflare API token is correct in Caddyfile
3. Caddy logs: `tail -f ~/.local/llama-models/caddy.log`

### Certificate errors
Caddy couldn't get a Let's Encrypt certificate. Verify:
1. DNS record is set to "DNS only" (gray cloud), not proxied (orange cloud)
2. API token has Zone:DNS:Edit permission
3. Wait a few minutes for DNS propagation

### Slow performance
- Disable Spotlight indexing: `sudo mdutil -a -i off`
- Check CPU usage: is something else hogging resources?
- Try a smaller model (14B instead of 32B)

---

## Performance Expectations (M2 Ultra, 192GB RAM)

| Model | Size | Quantization | Tokens/sec |
|-------|------|--------------|------------|
| Qwen 2.5 32B | ~20GB | 4-bit | ~28-30 |
| Mistral Small 24B | ~14GB | 4-bit | ~35-40 |
| Qwen 2.5 14B | ~10GB | 4-bit | ~50-60 |
| Llama 3.1 8B | ~5GB | 4-bit | ~80-100 |

---

## File Locations Summary

```
~/.local/
├── bin/
│   ├── caddy                    # Custom Caddy with Cloudflare DNS
│   ├── caddy-start.sh           # Caddy startup script
│   └── mlx-server-start.sh      # MLX server startup script
└── llama-models/
    ├── Caddyfile                # Caddy configuration
    ├── Qwen2.5-32B-MLX/         # Model files
    ├── caddy.log                # Caddy logs
    ├── caddy-access.log         # Access logs
    └── mlx-server.log           # MLX server logs

~/Library/LaunchAgents/
├── com.user.mlx-server.plist    # Auto-start MLX
└── com.user.caddy-proxy.plist   # Auto-start Caddy
```

---

## Security Notes

1. **Private IP**: Your model is only accessible from your local network (unless you expose it)
2. **CORS**: Only allows requests from your specified webapp domain
3. **No authentication**: The API has no auth - anyone on your network can use it
4. **API token**: Keep your Cloudflare API token secret (it's in the Caddyfile)

For production use, consider adding:
- API key authentication in Caddy
- Rate limiting
- Request logging for audit
