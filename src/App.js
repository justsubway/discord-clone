import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';

import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData } from 'react-firebase-hooks/firestore';

firebase.initializeApp({
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
})

const auth = firebase.auth();
const firestore = firebase.firestore();

function App() {
    const [user] = useAuthState(auth);

    return (
        <div className="App">
            {user ? <DiscordLayout /> : <SignIn />}
        </div>
    );
}

function SignIn() {
    const signInWithGoogle = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider);
    }

    return (
        <div className="sign-in-container">
            <div className="sign-in-card">
                <h1 className="sign-in-title">Welcome back!</h1>
                <p className="sign-in-subtitle">We're excited to see you again!</p>
                <button className="sign-in-button" onClick={signInWithGoogle}>
                    Sign in with Google
                </button>
            </div>
        </div>
    )
}

function DiscordLayout() {
    const [selectedChannel, setSelectedChannel] = useState('general');
    
    return (
        <>
            {/* Server Sidebar */}
            <div className="server-sidebar">
                <div className="server-icon active">💬</div>
                <div className="server-icon">+</div>
            </div>

            {/* Channel Sidebar */}
            <div className="channel-sidebar">
                <div className="server-header">
                    <span>SuperChat Server</span>
                </div>
                
                <div className="channel-categories">
                    <div className="category">
                        <div className="category-header">
                            <span>Text Channels</span>
                        </div>
                        <div className="channel-list">
                            <div 
                                className={`channel ${selectedChannel === 'general' ? 'active' : ''}`}
                                onClick={() => setSelectedChannel('general')}
                            >
                                <span className="channel-icon">#</span>
                                <span>general</span>
                            </div>
                            <div 
                                className={`channel ${selectedChannel === 'random' ? 'active' : ''}`}
                                onClick={() => setSelectedChannel('random')}
                            >
                                <span className="channel-icon">#</span>
                                <span>random</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
                <div className="chat-header">
                    <span className="channel-name">#{selectedChannel}</span>
                    <span className="channel-description">General discussion</span>
                </div>
                
                <ChatRoom channel={selectedChannel} />
            </div>
        </>
    );
}

function ChatRoom({ channel }) {
    const dummy = useRef();
    const messagesRef = firestore.collection('messages');
    const query = messagesRef.orderBy('createdAt').limit(25);

    const [messages] = useCollectionData(query, { idField: 'id' });
    const [formValue, setFormValue] = useState('');

    const sendMessage = async (e) => {
        e.preventDefault();

        const { uid, photoURL, displayName } = auth.currentUser;

        await messagesRef.add({
            text: formValue,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            uid,
            photoURL,
            displayName: displayName || 'Anonymous',
            channel: channel || 'general'
        })

        setFormValue('');
        dummy.current.scrollIntoView({ behavior: 'smooth' });
    }

    // Filter messages for the current channel, or show all if no channel filter
    const filteredMessages = messages ? messages.filter(msg => {
        // If message has channel property, filter by it
        if (msg.channel) {
            return msg.channel === channel;
        }
        // If message doesn't have channel property (old messages), show in general
        return channel === 'general';
    }) : [];

    return (
        <>
            <div className="messages-container">
                {filteredMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                <span ref={dummy}></span>
            </div>

            <div className="message-input-container">
                <form className="message-input-form" onSubmit={sendMessage}>
                    <input 
                        className="message-input"
                        value={formValue} 
                        onChange={(e) => setFormValue(e.target.value)} 
                        placeholder={`Message #${channel}`}
                    />
                    <button 
                        type="submit" 
                        className="message-send-button"
                        disabled={!formValue}
                    >
                        ➤
                    </button>
                </form>
            </div>
        </>
    )
}

function ChatMessage({ message }) {
    const { text, uid, photoURL, displayName, createdAt } = message;
    const messageClass = uid === auth.currentUser?.uid ? 'sent' : 'received';
    
    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        try {
            const date = timestamp.toDate();
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            return '';
        }
    };

    return (
        <div className={`message ${messageClass}`}>
            <img 
                className="message-avatar"
                src={photoURL || 'https://api.adorable.io/avatars/23/abott@adorable.png'} 
                alt="User avatar"
            />
            <div className="message-content">
                <div className="message-header">
                    <span className="message-author">
                        {displayName || 'Anonymous'}
                    </span>
                    <span className="message-timestamp">
                        {formatTime(createdAt)}
                    </span>
                </div>
                <div className="message-text">
                    {text}
                </div>
            </div>
        </div>
    )
}

function SignOut() {
    return auth.currentUser && (
        <button className="sign-out-button" onClick={() => auth.signOut()}>
            Sign Out
        </button>
    )
}

export default App;