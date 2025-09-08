# SabPaisa QR Backend

Node.js backend API for SabPaisa QR payment system.

## Features
- RESTful Merchant API
- HDFC Bank Integration
- Webhook Support
- Rate Limiting
- API Authentication

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## API Documentation

### Base URL
```
http://localhost:3001/api/v1/merchant
```

### Authentication
All requests require:
- `X-API-Key`: Your merchant API key
- `X-API-Secret`: Your merchant API secret

### Endpoints
- `POST /qr/generate` - Generate single QR
- `POST /qr/bulk` - Generate bulk QRs
- `GET /qr/list` - List QR codes
- `GET /transactions` - Get transactions
- `GET /analytics` - Get analytics

## Environment Variables

Create a `.env` file:

```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost/sabpaisa
```

## Docker

```bash
docker build -t sabpaisa-backend .
docker run -p 3001:3001 sabpaisa-backend
```
