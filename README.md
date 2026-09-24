# JuiceNest Premium Campus Ordering

A dependency-free Node.js prototype with real server-side role checks.

## Run

```bash
node server.js
```

Open: `http://localhost:8080`

## Demo staff accounts

- Admin: `admin` / `Admin@123`
- Delivery: `delivery1` / `Delivery@123`
- Kitchen: `kitchen1` / `Kitchen@123`

Change these before real deployment. Passwords are stored as scrypt hashes after first startup.

## Included

- Premium responsive customer storefront
- Search, categories, favourites, custom juice, cart and checkout
- Separate Student / Teacher checkout flows
- Student fields: name, roll no, class/department, class/room no, block
- Teacher fields: name, department, staff room/room no, block (no roll number)
- Break-time preorder slots
- Order tracking and 4-digit delivery verification code
- Admin dashboard: analytics, order management, product/stock control, delivery assignment and staff account creation
- Kitchen queue: accept -> preparing -> ready
- Delivery panel: assigned orders, block grouping, pickup -> out for delivery -> OTP verified delivery
- Server-side role-based routes and APIs
- Session cookies (HttpOnly, SameSite=Lax), password hashing with Node crypto.scrypt, login rate limiting
- PWA manifest + service worker, dark/light mode

## Important before production

This is a strong working prototype, but production deployment should move storage from JSON to PostgreSQL/MySQL/MongoDB, use HTTPS, CSRF protection, a persistent session store, secure secret management, backups, audit retention, and a real payment gateway.
