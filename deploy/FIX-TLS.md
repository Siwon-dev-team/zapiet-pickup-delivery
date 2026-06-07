# Fix TLS for zapiet.spfmktplace.tech.siwon.ca

## Problem

Shopify automated checks fail with:

- **TLS certificate error** — certificate CN/SAN does not match `zapiet.spfmktplace.tech.siwon.ca`
- **Verifies webhooks with HMAC signatures** — often fails when HTTPS is wrong (Shopify cannot reach webhooks)

**Cause (confirmed):** nginx on port 443 is serving the **we-open** certificate (`CN=weopen.spfmktplace.tech.siwon.ca`) for the zapiet hostname. zapiet needs its own vhost and Let's Encrypt cert.

## Fix on droplet (`137.184.173.207`)

SSH in, then run:

```bash
# 1) HTTP vhost for zapiet (port 3006 = PM2 zapiet-pickup-delivery)
sudo cp /var/www/zapiet-pickup-delivery/deploy/nginx-zapiet-pickup-delivery.conf \
  /etc/nginx/sites-available/zapiet-pickup-delivery

sudo ln -sf /etc/nginx/sites-available/zapiet-pickup-delivery /etc/nginx/sites-enabled/

sudo nginx -t && sudo systemctl reload nginx

# 2) Issue cert for zapiet only (follow prompts; use admin email)
sudo certbot --nginx -d zapiet.spfmktplace.tech.siwon.ca

# 3) Verify certificate matches zapiet (not weopen)
echo | openssl s_client -connect zapiet.spfmktplace.tech.siwon.ca:443 \
  -servername zapiet.spfmktplace.tech.siwon.ca 2>/dev/null \
  | openssl x509 -noout -subject

# Expected: subject=CN = zapiet.spfmktplace.tech.siwon.ca

curl -sI https://zapiet.spfmktplace.tech.siwon.ca/ | head -5
```

## After SSL works

1. Partner Dashboard → App → **Run** automated checks again.
2. Optional webhook test:

```bash
curl -sI https://zapiet.spfmktplace.tech.siwon.ca/webhooks/compliance
# 404/405 on GET is OK; TLS must be valid
```

## If certbot fails

- DNS: `dig +short zapiet.spfmktplace.tech.siwon.ca` → `137.184.173.207`
- PM2: `curl -sI http://127.0.0.1:3006/` → `200`
- Port 80 reachable from internet (required for HTTP-01 challenge)
