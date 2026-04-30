# Lotus Autobatch Dashboard

A web-based dashboard and API for monitoring and managing the auto-batching process, rider assignments, and order statuses. This project connects to multiple MongoDB collections to aggregate data for logistics and operations tracking.

## Features

- **Pending Orders Monitoring**: View pending orders that have not yet been batched or assigned.
- **Job Tracking**: Search and list auto-batching jobs within a specific time frame, including assigned riders and SLAs.
- **Stuck Jobs Identification**: Find jobs that are stuck in the auto-batching process.
- **Rider Pool Status**: Monitor the status of riders in specific store zones, checking their availability, active jobs, and eligibility for auto-assignment.
- **Order & Batch Queries**: Search for specific orders by consignment or order ID, and check batching statuses.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **Frontend**: HTML, CSS, JavaScript (served via Express static files)

## Prerequisites

- Node.js
- MongoDB Connection String (URI)

## Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory and add your MongoDB URI and port:
   ```env
   MONGO_URI=mongodb://your-mongodb-uri
   PORT=3000
   ```

## Running the Application

To start the server, run:
```bash
npm start
```
Or for development:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## API Endpoints

- `GET /api/pending`: Get pending orders.
- `GET /api/jobs`: Get jobs for a time frame.
- `GET /api/stuck`: Get stuck jobs.
- `GET /api/riders`: Get rider pool status.
- `GET /api/orders`: Query orders by ID or consignment.
- `GET /api/batches`: Get batch information by order IDs.

## Version
Current version: 1.0.2
