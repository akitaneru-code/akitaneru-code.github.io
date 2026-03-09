# 우리누리 - Personal Wiki with Firebase Auth

A modern personal wiki with user authentication and document management using Firebase.

## Current Status

✅ **Authentication System**: Signup, login, logout implemented
✅ **Document Management**: Create, read, delete documents with Firestore
✅ **UI**: Modern responsive interface with sidebar for document management
✅ **Server**: Running on port 5000

## Firebase Setup Required

The app currently uses **local storage fallback** for testing. To connect to real Firebase:

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Create a project"
3. Name it (e.g., "우리누리")
4. Continue through setup
5. Once created, click "Web" to add a web app
6. Copy your Firebase config

### Step 2: Enable Authentication
1. Go to **Authentication** → **Sign-in method**
2. Enable **Email/Password**

### Step 3: Create Firestore Database
1. Go to **Firestore Database** → **Create database**
2. Start in **test mode** (for development)

### Step 4: Add Your Config to auth.js
Edit `auth.js` and replace the `firebaseConfig` object with your credentials:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Find these values in: **Project Settings** → **Your Apps** → **Firebase SDK snippet** (Config tab)

## Project Structure

```
├── server.js          - Node.js static file server
├── index.html         - Main HTML with auth UI
├── app.js             - Main app logic (auth flow, page management)
├── auth.js            - Firebase auth module
├── styles.css         - All styling
├── README.md          - Wiki home page
├── _sidebar.md        - Navigation sidebar
└── japanese.md        - Sample wiki content
```

## Features

### Authentication
- Email/password signup with validation
- Login with error handling
- Logout
- User session persistence

### Document Management
- Create new documents (markdown format)
- View saved documents
- Delete documents
- User-specific document storage (each user sees only their documents)

### UI Components
- Clean auth screen with tabs for login/signup
- Top navigation bar with user email and logout
- Sidebar with document list and creation form
- Main content area for document display
- Responsive design for mobile

## Running Locally

```bash
# Server is managed by Replit workflow "Start application"
# Runs: node server.js
# Port: 5000
```

## Deployment

Currently configured for static deployment. When deploying to production:
1. Update Firebase security rules in Firestore
2. Configure proper authentication settings
3. Update CORS if needed
4. Switch from test mode to production mode in Firestore

## Local Testing Without Firebase

The app includes a localStorage fallback for testing:
- Signs up/logs in users locally
- Data is stored in browser localStorage
- Perfect for development without Firebase setup
- Switch to real Firebase when config is added

## Namu Mark (나무마크) Support

The wiki uses **Namu Mark** syntax (Korean wiki markup) for document formatting:

### Syntax Examples
- `== Heading ==` - Large heading
- `=== Heading 3 ===` - Smaller heading  
- `'''bold text'''` - Bold
- `''italic text''` - Italic
- `~~strikethrough~~` - Strikethrough
- `__underline__` - Underline
- `[link|description]` - Link
- `* item` - Bullet list (use `**` for nesting)
- `1. item` - Numbered list
- `{{{ code }}}` - Code block
- `----` - Horizontal line

A "나무마크 문법" button in the sidebar shows the complete syntax guide.

## Notes

- Passwords must be at least 6 characters
- All user data is isolated per user (uid-based)
- Documents support Namu Mark formatting
- Timestamps are stored for document creation/updates
