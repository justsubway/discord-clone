# Firebase ChatApp 🔥💬

A real-time chat application built with **React**, **Firebase Firestore**, and **Firebase Authentication**.

---

## 🚀 Features

- **Real-time messaging**: Instant updates using Firebase Firestore  
- **Google Sign-In**: Secure authentication with Firebase Auth  
- **Profanity filtering**: Automatic bad word detection and filtering  
- **Responsive design**: Works on desktop and mobile  
- **Free hosting**: Deployed on Firebase Hosting  

---

## 📂 Project Structure

```
superchat/
├── public/               # Static assets
├── src/                  # React application
│   ├── App.js            # Main application component
│   ├── firebase.js       # Firebase configuration
│   └── ...               # Other React components
├── firebase.json         # Firebase deployment config
└── package.json          # Project dependencies
```

---

## 🛠️ Tech Stack

| Layer     | Technologies                          |
|-----------|---------------------------------------|
| Frontend  | React, Create-React-App               |
| Backend   | Firebase (Firestore, Authentication)  |
| Hosting   | Firebase Hosting                      |
| Styling   | CSS (App.css)                         |

---

## 🧭 Getting Started

### Requirements

- Node.js (v16+ recommended)  
- Firebase account (free tier available)  
- Google account for authentication  

---

### 🔧 Installation

1. **Clone the repo**

```bash
git clone https://github.com/justsubway/ChatApp.git
cd ChatApp
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up Firebase**

- Go to [Firebase Console](https://console.firebase.google.com/) and create a new project  
- Enable **Google Sign-In** and **Cloud Firestore**  
- Copy your Firebase config into `src/firebase.js`

4. **Create `.env.local` in project root**

```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:abc123def456
```

5. **Run the app locally**

```bash
npm start
```

Then visit: [http://localhost:3000](http://localhost:3000)

---

## 🚀 Deployment (Firebase Hosting)

1. **Build the project**

```bash
npm run build
```

2. **Deploy to Firebase**

```bash
firebase deploy
```

Your app will be live at:

```
https://your-project-id.web.app
```

---

## ✅ Usage

- Click **"Sign in with Google"**  
- Type messages in the input field  
- Messages appear instantly in real-time  

---

## 🧩 Customization Ideas

- Add timestamps to messages  
- Create multiple chat rooms  
- Add emoji picker integration  
- Enable image/file uploads with Firebase Storage  

---

## 🤝 Contributing

1. Fork the repository  
2. Create a new branch  
   ```bash
   git checkout -b feature/your-feature
   ```
3. Commit your changes  
4. Push the branch  
5. Open a Pull Request  

---

## 📝 License

MIT License — see the [LICENSE](LICENSE) file for details.

---

## 📬 Contact

- GitHub: [@justsubway](https://github.com/justsubway)  
- Live App: [https://chat-app-dc6f4.web.app](https://chat-app-dc6f4.web.app)
