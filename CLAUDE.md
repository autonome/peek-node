# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Webhook server for the Peek iOS app. Receives URLs from the mobile app and stores them in SQLite. Built with Hono running on Node.js, designed for deployment on Railway.

## Commands

- `npm start` - Run the production server
- `npm run dev` - Run with file watching (auto-restart on changes)
- `npm test` - Run the test suite

**Important:** Run `npm test` after making changes to verify nothing is broken.

## Architecture

- **index.js** - Hono HTTP server with API endpoints
- **db.js** - SQLite database module (better-sqlite3)

### API Endpoints

- `GET /` - Health check
- `POST /webhook` - Receive URLs from iOS app (`{ urls: [{ url, tags }] }`)
- `GET /urls` - List all saved URLs with tags
- `GET /tags` - List tags sorted by frecency
- `DELETE /urls/:id` - Delete a URL
- `PATCH /urls/:id/tags` - Update tags for a URL

### Database Schema

Matches the iOS app (peek-mobile) schema:
- `urls` - Saved URLs with timestamps
- `tags` - Tag names with frecency scoring
- `url_tags` - Many-to-many junction table
- `settings` - Key-value configuration

Database stored in `./data/peek.db` (Railway volume mount). Override with `DATA_DIR` env var.

## Deployment

Configured for Railway (`railway.json`) using Nixpacks builder with automatic restart on failure. Attach a volume and set `DATA_DIR` to the mount path for persistent storage.
