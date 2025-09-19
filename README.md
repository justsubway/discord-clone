# 💬 SuperChat - Discord Clone

A modern, real-time chat application built with React and Firebase, featuring a Discord-inspired interface with advanced guest user support.

![SuperChat Logo](public/SuperChat.png)

## ✨ Features

### 🔐 **Authentication System**
- **Google Sign-In**: Secure authentication using Firebase Auth
- **Guest Mode**: Anonymous users can join without registration
- **Unique Guest Codes**: Each guest gets a 4-character identifier (e.g., "Guest A7K2")
- **Custom Guest Avatars**: Auto-generated avatars for each guest user

### 🎨 **Discord-Inspired UI**
- **Three-Panel Layout**: Server sidebar, channel sidebar, and main chat area
- **Dark Theme**: Professional Discord-style color scheme
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Smooth Animations**: Hover effects, transitions, and micro-interactions

### 💬 **Chat Features**
- **Real-Time Messaging**: Instant message delivery using Firebase Firestore
- **Multiple Channels**: Switch between "general" and "random" channels
- **Message History**: Persistent message storage and retrieval
- **User Distinction**: Clear visual differences between regular users and guests
- **Timestamps**: Message timestamps for better context

### 👥 **User Management**
- **Profile Pictures**: Custom avatars for all users
- **Display Names**: Proper name handling for both registered and guest users
- **Guest Identification**: Special styling and unique codes for guest users
- **Sign-Out**: Easy logout with beautiful red button design

## 🚀 **Getting Started**

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Firebase project with Authentication and Firestore enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/justsubway/discord-clone.git
   cd discord-clone
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Google and Anonymous)
   - Enable Firestore Database
   - Create a `.env` file in the root directory:
   ```env
   REACT_APP_FIREBASE_API_KEY=your_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 🛠️ **Technology Stack**

- **Frontend**: React 19.1.0
- **Styling**: CSS3 with custom Discord-inspired design
- **Backend**: Firebase (Authentication, Firestore)
- **Real-time**: Firebase Firestore real-time listeners
- **Icons**: Custom SVG icons and DiceBear API for avatars
- **Deployment**: Firebase Hosting ready

## 📱 **Screenshots**

### Sign-In Page
- Beautiful gradient background
- Large SuperChat logo
- Google and Guest sign-in options
- Professional card design

### Main Chat Interface
- Discord-style three-panel layout
- Real-time message updates
- Channel switching
- User avatars and names
- Guest user distinction

## 🔧 **Configuration**

### Firebase Setup
1. **Authentication Methods**:
   - Enable Google Sign-In
   - Enable Anonymous Authentication

2. **Firestore Rules**:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /messages/{document} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

### Environment Variables
Make sure to set up all required Firebase environment variables in your `.env` file.

## 🎯 **Key Features Explained**

### Guest User System
- **Unique Codes**: 4-character alphanumeric codes (A-Z, 0-9)
- **Custom Avatars**: Generated using DiceBear API with consistent styling
- **Visual Distinction**: Light blue, italic text for guest names
- **Persistent Storage**: Guest codes stored in localStorage

### Message System
- **Real-time Updates**: Messages appear instantly across all clients
- **Channel Filtering**: Messages are filtered by selected channel
- **Backward Compatibility**: Old messages without channel property show in "general"
- **Rich Metadata**: Includes user info, timestamps, and guest codes

### UI/UX Design
- **Discord Aesthetics**: Faithful recreation of Discord's design language
- **Responsive Layout**: Adapts to different screen sizes
- **Smooth Interactions**: Hover effects, transitions, and animations
- **Professional Branding**: Custom logo and consistent color scheme

## 🚀 **Deployment**

### Firebase Hosting
1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy to Firebase**
   ```bash
   firebase deploy
   ```

### Other Platforms
The app can be deployed to any static hosting service:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **Discord** for the amazing design inspiration
- **Firebase** for the robust backend services
- **React** for the powerful frontend framework
- **DiceBear** for the avatar generation API

## 📞 **Support**

If you have any questions or need help, please:
- Open an issue on GitHub
- Check the Firebase documentation
- Review the React documentation

---

**Built with ❤️ by the SuperChat team**