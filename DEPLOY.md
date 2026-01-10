# Deployment Guide

The **Twitter2Gif** application is a full-stack Node.js application that requires a running server and the `ffmpeg` binary to process videos.

> [!WARNING]
> **Why Netlify/Vercel won't work:**
> Platforms like Netlify and Vercel are designed for **static websites** or short-lived serverless functions. They do not support:
> 1. Persistent servers (needed for `express` to listen).
> 2. Heavy binaries like `ffmpeg` (often too large for serverless function limits).
> 3. Long-running processes (video conversion takes time).

## Recommended Hosting: Render.com

Render is the best free/cheap option for hosting Node.js applications with native binaries.

### Steps to Deploy

1.  **Push your code to GitHub**
    *   Initialize git: `git init`
    *   Add files: `git add .`
    *   Commit: `git commit -m "Initial commit"`
    *   Create a repo on GitHub and push.

2.  **Create a Web Service on Render**
    *   Go to [dashboard.render.com](https://dashboard.render.com).
    *   Click **New +** -> **Web Service**.
    *   Connect your GitHub repository.

3.  **Configure the Service**
    *   **Name:** `twitter2gif` (or similar)
    *   **Runtime:** `Node`
    *   **Build Command:** `npm install`
    *   **Start Command:** `npm start`
    *   **Instance Type:** Free (or Starter if you want faster conversions)

4.  **Deploy**
    *   Click **Create Web Service**.
    *   Render will install dependencies and start your server.

### Notes on FFMPEG
This project uses `ffmpeg-static` and `fluent-ffmpeg`.
*   `ffmpeg-static` automatically downloads the correct binary for the operating system (Linux on Render/Railway).
*   This means it should **Just Work™** without installing system-level ffmpeg manually.

## Alternative: Railway.app

Railway is another excellent option that detects `package.json` and runs it automatically.

1.  Go to [railway.app](https://railway.app).
2.  Start a new project from your GitHub repo.
3.  It will automatically detect Node.js and run `npm start`.
4.  It just works.
