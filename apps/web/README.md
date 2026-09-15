# Zono Web

Aplicación pública separada del ERP. Incluye catálogo, carrito, landing de tanques y cotizador.

## Cloudflare Pages

Configurá el proyecto **zonoconstruccion** con:

- Rama de producción: `main`
- Directorio raíz: `apps/web`
- Comando de compilación: `npx @cloudflare/next-on-pages`
- Directorio de salida: `.vercel/output/static`

Variables necesarias: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_META_PIXEL_ID`.

El ERP conserva su proyecto Cloudflare y debe apuntar a la raíz del repositorio hasta completar su propia migración a `apps/erp`. La migración del adaptador de Pages a OpenNext/Workers queda fuera de esta separación para no alterar los dominios ni el despliegue actual.
