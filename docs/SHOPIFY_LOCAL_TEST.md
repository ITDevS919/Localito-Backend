# Shopify sync – local testing

## 1. Env vars (done)

In `server/.env` you should have:

- `SHOPIFY_API_KEY` – app API key (client id)
- `SHOPIFY_API_SECRET` – app secret (client secret)

## 2. Shopify Partner Dashboard (redirect URLs)

For local OAuth, Shopify must be able to call your callback.

1. Open your app → **Configuration** (or **App setup** → **URLs**).
2. **App URL:** `http://localhost:5000/api/shopify/auth`
3. **Allowed redirection URL(s):** add  
   `http://localhost:5000/api/shopify/callback`

If your backend runs on another host/port, use that base URL instead (e.g. `http://127.0.0.1:5000/api/shopify/...`).

## 3. Run backend and frontend

```bash
# Terminal 1 – server
cd server && npm run dev

# Terminal 2 – client
cd client && npm run dev
```

Backend: http://localhost:5000  
Frontend: http://localhost:5173 (or your Vite port).

## 4. Test connect + product list

1. Log in as a **business** user.
2. Go to **Settings** → **Open Shopify settings** (or `/business/shopify-settings`).
3. Enter your store domain, e.g. `your-store.myshopify.com`.
4. Click **Connect with Shopify**.
5. You’ll be sent to Shopify to install/authorize the app; approve.
6. You should be redirected back to Shopify settings with “Connected”.
7. **Test connection** – should succeed if the app can reach Shopify.
8. In **Products** → **Create product**, enable **Sync stock from EPOS** and open the **Shopify product** dropdown – your store’s products should load.

## 5. Test product link + stock

1. Create or edit a product.
2. Check **Sync stock from EPOS** and choose a **Shopify product**.
3. Save; product should have `shopify_product_id` and stock can sync from Shopify when the product is viewed or listed.

## Troubleshooting

- **“SHOPIFY_API_KEY or SHOPIFY_CLIENT_ID is required”**  
  Env vars not loaded. Run the server from `server/` so `server/.env` is used, or set `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in the environment.

- **Redirect/callback errors**  
  Redirect URL in Partner Dashboard must match exactly (including `http` vs `https`, port, and path `/api/shopify/callback`).

- **No products in dropdown**  
  Ensure the store has products and the app has `read_products` (and optionally `read_inventory`) in its scopes.
