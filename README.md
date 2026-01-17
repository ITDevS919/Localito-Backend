# Marketplace Backend

Node.js + Express backend server with TypeScript.

## Project Structure

```
server/
├── src/
│   ├── app.ts              # Express app configuration
│   ├── server.ts           # Server startup and configuration
│   ├── routes/             # API route handlers
│   │   └── index.ts
│   ├── controllers/        # Business logic controllers
│   ├── services/          # Business logic services
│   │   └── storage.ts
│   └── middleware/         # Express middleware
│       ├── errorHandler.ts
│       ├── requestLogger.ts
│       └── staticFiles.ts
├── shared/                 # Shared types and schemas
│   └── schema.ts
├── index.ts               # Entry point
└── package.json
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database:
   - Make sure PostgreSQL is installed and running on your system
   - Create a database for the project:
   ```sql
   CREATE DATABASE localito;
   ```

3. Set up environment variables (create a `.env` file in the server directory):
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:5173
   BACKEND_URL=http://localhost:5000

   # Session Secret (change this in production!)
   SESSION_SECRET=localito-secret-key-change-in-production

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=localito
   DB_USER=postgres
   DB_PASSWORD=postgres

   # Stripe Configuration (for payments and Connect)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_CLIENT_ID=ca_...  # OAuth Client ID from Stripe Dashboard
   STRIPE_PLATFORM_ACCOUNT_ID=acct_...  # Optional: Your platform account ID

   # Google OAuth Configuration (for authentication)
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
   ```

   Adjust the database configuration (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) to match your PostgreSQL setup.

   **Important for Stripe OAuth:**
   - `BACKEND_URL` must be set to your backend server URL (e.g., `http://localhost:5000` or `https://api.yourdomain.com`)
   - The redirect URI `{BACKEND_URL}/api/retailer/stripe/oauth/callback` must be registered in your Stripe OAuth application settings
   - Go to Stripe Dashboard → Developers → OAuth → Your OAuth App → Redirect URLs and add the exact URL

## Development

Start the development server with hot reload:
```bash
npm run dev
```

The server will be available at `http://localhost:5000`.

## Build

Build for production:
```bash
npm run build
```

The build output will be in the `dist` directory.

## Production

Start the production server:
```bash
npm start
```

Make sure to build the frontend first and place it in `client/build` directory for the server to serve static files.

## Type Checking

Run TypeScript type checking:
```bash
npm run type-check
```

