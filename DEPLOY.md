# Despliegue · emma.xplain.pe (VPS Contabo)

PWA **estática** servida por un contenedor `nginx:alpine` (bind-mount de solo lectura),
detrás del Nginx del host como reverse-proxy con SSL Let's Encrypt.

- Servidor: `217.216.93.101` (`root`, llave `~/.ssh/contabo_ed25519`)
- App en: `/var/docker/emma-papa/`
- Puerto local: `127.0.0.1:8140` (solo localhost; el host hace el proxy)
- Dominio: `emma.xplain.pe` (DNS en Contabo, ya resuelve al VPS)

## Primer despliegue

```bash
# 1) Clonar el repo en la convención del servidor
git clone https://github.com/stefanomorykahn/emma-papa.git /var/docker/emma-papa
cd /var/docker/emma-papa

# 2) Levantar el contenedor (sirve los estáticos en 127.0.0.1:8140)
docker compose up -d
./scripts/health-check.sh

# 3) Vhost del host (reverse-proxy). Crear /etc/nginx/xplain.pe/emma.conf:
#    server { server_name emma.xplain.pe; location / { proxy_pass http://localhost:8140; ... }
#             location /.well-known/acme-challenge/ { root /var/www/html; } listen 80; }
sudo nginx -t && sudo systemctl reload nginx

# 4) SSL (el subdominio ya apunta al VPS por el comodín *.xplain.pe)
sudo certbot --nginx -d emma.xplain.pe

# 5) Verificar
curl -sI https://emma.xplain.pe/
```

## Actualizar (tras un push a GitHub)

```bash
cd /var/docker/emma-papa && ./scripts/update.sh
```

Los archivos se sirven por bind-mount, así que `git pull` actualiza el sitio al instante.
En el celular, cerrar/reabrir la app para que el service worker tome la nueva versión.

## Operación

```bash
docker compose ps
docker compose logs -f
sudo nginx -t
sudo certbot renew --dry-run
```

## Config externa a actualizar (una vez)

- **Google Cloud → OAuth client `emma-papa-web`**: agregar `https://emma.xplain.pe`
  a "Orígenes de JavaScript autorizados" (mantener también el de GitHub Pages si sigue en uso).
- **Supabase → Authentication → URL Configuration**: agregar `https://emma.xplain.pe`
  a Redirect URLs (y, si se quiere, fijarlo como Site URL para el correo de recuperación).
