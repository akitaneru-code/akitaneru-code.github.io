# 우리누리 - Personal Wiki

A static personal wiki site built with [Docsify](https://docsify.js.org/).

## Project Structure

- `index.html` - Main entry point, loads Docsify from CDN
- `server.js` - Simple Node.js static file server
- `styles.css` - Custom styles
- `README.md` - Wiki home page
- `_sidebar.md` - Docsify sidebar navigation
- `japanese.md` - Japanese language notes
- `app.js` - Firebase snippet (placeholder, not active)

## Setup

- **Runtime**: Node.js 20
- **Server**: Custom Node.js HTTP static file server
- **Port**: 5000 (0.0.0.0)
- **Deployment**: Static site

## Running

The workflow `Start application` runs `node server.js` which serves static files on port 5000.

## Notes

- `app.js` contains placeholder Firebase config (`APIKEY`, `PROJECT`) that is not connected to a real Firebase project.
- The wiki content is served as-is via Docsify, which renders Markdown files in the browser.
