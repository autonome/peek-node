# peek-node

Backend server for the [Peek iOS app](https://github.com/user/peek-mobile). Receives URLs via webhook and stores them in SQLite.

## Setup

```bash
npm install
npm run dev
```

Server runs on `http://localhost:3000` (or `PORT` env var).

## Authentication

All endpoints except `/` (health check) require a Bearer token:

```
Authorization: Bearer <API_KEY>
```

Set the `API_KEY` environment variable on the server. If not set, auth is disabled (for local dev).

## API

### Health Check
```
GET /
```
Returns `{"status":"ok","message":"Webhook server running"}`

### Receive URLs (webhook)
```
POST /webhook
Content-Type: application/json

{
  "urls": [
    { "url": "https://example.com", "tags": ["tag1", "tag2"] }
  ]
}
```
Returns `{"received":true,"saved_count":1}`

### List URLs
```
GET /urls
```
Returns `{"urls":[{"id":"...","url":"...","saved_at":"...","tags":["..."]}]}`

### List Tags
```
GET /tags
```
Returns tags sorted by frecency (frequency + recency).

### Delete URL
```
DELETE /urls/:id
```

### Update Tags
```
PATCH /urls/:id/tags
Content-Type: application/json

{ "tags": ["new-tag1", "new-tag2"] }
```

## Database

SQLite database stored at `./data/peek.db`. Schema matches the iOS app:

- `urls` - Saved URLs with timestamps
- `tags` - Tag names with frecency scoring
- `url_tags` - Many-to-many junction table
- `settings` - Key-value configuration

## Testing

```bash
npm test
```

Runs 33 tests covering database operations, API endpoints, and authentication.

## Deployment

Configured for [Railway](https://railway.app):

1. Connect your repo to Railway
2. Add a volume mounted at `./data`
3. Deploy

The `railway.json` configures Nixpacks build with auto-restart on failure.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATA_DIR` | Database directory | `./data` |
| `API_KEY` | Bearer token for auth | (none, auth disabled) |
