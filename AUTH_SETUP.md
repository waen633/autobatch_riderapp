# Local Auth Setup

Short setup guide for running the app locally with Keycloak authentication and app-owned menu permissions.

## Summary

This setup uses Keycloak for login, password handling, and main roles. The app reads the logged-in user from the Keycloak token, then loads visible menu permissions from the application-owned permission store.

Keycloak should contain:

```text
realm: autobatch
client: autobatch-dashboard
roles: admin, user
users: admin1, user1
```

The app permission store controls which dashboard menus each user can see. Do not store user passwords or production secrets in the app database.

## 1. Install dependencies

```bash
npm install
```

Use a Node.js version that supports the current project runtime. Menu permissions are stored in the local app database, not in Keycloak attributes.

## 2. Required `.env` variables

Copy `.env.example` to `.env`, then fill in local values. Do not commit real secrets.

```bash
PORT=3000
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
SESSION_SECRET=replace-with-random-session-secret

KEYCLOAK_BASE_URL=http://localhost:8080
KEYCLOAK_REALM=autobatch
KEYCLOAK_CLIENT_ID=autobatch-dashboard
KEYCLOAK_CLIENT_SECRET=replace-with-dashboard-client-secret
KEYCLOAK_ISSUER=http://localhost:8080/realms/autobatch
KEYCLOAK_JWKS_URI=http://localhost:8080/realms/autobatch/protocol/openid-connect/certs
KEYCLOAK_AUDIENCE=autobatch-dashboard
KEYCLOAK_ADMIN_ROLE=admin
KEYCLOAK_USER_ROLE=user

KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASS=replace-with-keycloak-admin-password
KEYCLOAK_ADMIN_CLIENT_ID=autobatch-admin-service
KEYCLOAK_ADMIN_CLIENT_SECRET=replace-with-service-account-secret
```

The rider app database is for reading rider/operation data only. User role menu permissions are stored separately by this application.

## 3. Run Keycloak locally with Docker

Start Keycloak on `http://localhost:8080`:

```bash
docker compose up -d
```

Stop Keycloak:

```bash
docker compose stop
```

Open the admin console:

```text
http://localhost:8080
```

Login with the local dev admin account:

```text
admin / admin
```

## 4. Create realm, client, roles, and users

In Keycloak Admin Console:

1. Create realm: `autobatch`
2. Create OIDC client: `autobatch-dashboard`
3. Set valid redirect URIs:

```text
http://localhost:3000/*
```

4. Set web origins:

```text
http://localhost:3000
```

5. Create realm roles:

```text
admin
user
```

6. Create users:

```text
admin1  -> assign role admin
user1   -> assign role user
```

7. Set passwords for both users and turn off temporary password.
8. If using Keycloak Admin REST from the app, create service client `autobatch-admin-service`, enable service accounts, grant user/role management permissions, then copy its secret into `.env`.

## 5. Start the app

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 6. Test admin/user menu permission

1. Login as `admin1`.
2. Open Admin User Management.
3. Edit `user1`.
4. Select menu permissions, for example:

```text
dashboard
analytics
routeTools
```

5. Save the user.
6. Logout, then login as `user1`.
7. Confirm `/api/auth/me` returns:

```json
{
  "isAdmin": false,
  "menus": ["dashboard", "analytics", "routeTools"]
}
```

8. Confirm the visible menu shows only:

```text
Dashboard
Analytics
Route Tools
```

9. Confirm these are hidden for `user1`:

```text
Dispatcher
AI Chat
Admin
```

Admins should receive the admin-allowed menus. Normal users with no saved permission record should default to `dashboard` only.
