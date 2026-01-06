# CEA API Testing with GCP Whitelisted IP

## Overview

The CEA Aquacis APIs only accept requests from whitelisted IPs. This guide sets up a proxy on your GCP instance so you can test from anywhere.

## Architecture

```
Local Machine → GCP Squid Proxy (Whitelisted IP) → CEA Aquacis API
```

---

## Step 1: Install Squid Proxy on GCP

SSH into your GCP instance:

```bash
# Install Squid
sudo apt update
sudo apt install squid -y

# Backup original config
sudo cp /etc/squid/squid.conf /etc/squid/squid.conf.backup
```

## Step 2: Configure Squid

```bash
sudo nano /etc/squid/squid.conf
```

Replace with this config:

```conf
# CEA Proxy Configuration
http_port 3128

# ACL definitions
acl localnet src 10.0.0.0/8
acl localnet src 172.16.0.0/12
acl localnet src 192.168.0.0/16
acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl CONNECT method CONNECT

# Allow CEA domains
acl cea_domains dstdomain .ceaqueretaro.gob.mx
acl cea_domains dstdomain .aquacis.com

# Security rules
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports

# Allow local network and CEA domains
http_access allow localnet cea_domains
http_access allow localhost

# Deny everything else
http_access deny all

# Forward headers
forwarded_for off
request_header_access Via deny all
request_header_access X-Forwarded-For deny all

# Logging
access_log /var/log/squid/access.log
```

## Step 3: Start Squid

```bash
# Restart Squid
sudo systemctl restart squid
sudo systemctl enable squid

# Check status
sudo systemctl status squid

# Test locally
curl -x http://localhost:3128 https://aquacis-cf-int.ceaqueretaro.gob.mx
```

## Step 4: Open Firewall

```bash
# GCP Console or gcloud
gcloud compute firewall-rules create allow-proxy \
    --allow tcp:3128 \
    --source-ranges YOUR_LOCAL_IP/32 \
    --description "Allow proxy access for CEA testing"
```

Or in GCP Console:
1. VPC Network → Firewall
2. Create rule: TCP 3128, restricted to your IP

## Step 5: Configure cea-agent-server-v2

Create `.env` file:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# CEA Proxy (YOUR GCP EXTERNAL IP)
CEA_PROXY_URL=http://YOUR_GCP_EXTERNAL_IP:3128
```

## Step 6: Test

```bash
# Run API tests
npm run test:api

# Or interactive mode
npm run test -- -i
```

---

## Alternative: SSH Tunnel (No Squid Required)

If you don't want to install Squid:

```bash
# Terminal 1: Create SOCKS proxy
ssh -D 1080 -C -N your-user@YOUR_GCP_IP

# Terminal 2: Set env and run
export CEA_PROXY_URL=socks5://localhost:1080
npm run test:api
```

Note: You'll need to modify `tools.ts` to support SOCKS5:

```typescript
import { ProxyAgent } from 'undici';

// For SOCKS5 support, use:
const proxyAgent = new ProxyAgent({
    uri: PROXY_URL,
    protocol: PROXY_URL.startsWith('socks') ? 'socks5' : 'http'
});
```

---

## Troubleshooting

### Proxy Connection Refused
```bash
# Check Squid is running
sudo systemctl status squid

# Check port is open
sudo netstat -tlnp | grep 3128
```

### Firewall Issues
```bash
# Check GCP firewall
gcloud compute firewall-rules list --filter="name=allow-proxy"

# Check local iptables
sudo iptables -L -n | grep 3128
```

### SSL Errors
The proxy doesn't intercept SSL - it uses CONNECT method. If you get SSL errors, check that CEA's certificate is valid.

### Test Proxy Directly
```bash
curl -v -x http://YOUR_GCP_IP:3128 \
  -H "Content-Type: text/xml" \
  https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services/InterfazGenericaContratacionWS
```

---

## Security Considerations

1. **Restrict proxy access** to your IP only (firewall rule)
2. **Use authentication** if exposing proxy longer term
3. **Monitor logs** at `/var/log/squid/access.log`
4. **Consider VPN** for production testing
