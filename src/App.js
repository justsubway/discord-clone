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
        <div className={`App ${user ? 'discord-layout' : ''}`}>
            {user ? <DiscordLayout /> : <SignIn />}
        </div>
    );
}

function SignIn() {
    const [isLoading, setIsLoading] = useState(false);
    const [isGuestLoading, setIsGuestLoading] = useState(false);

    const signInWithGoogle = async () => {
        setIsLoading(true);
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
        } catch (error) {
            console.error('Sign in error:', error);
        } finally {
            setIsLoading(false);
        }
    }

    const generateGuestCode = () => {
        // Generate a 4-character guest code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const signInAsGuest = async () => {
        setIsGuestLoading(true);
        try {
            console.log('Attempting guest sign in...');
            // Create anonymous user
            const result = await auth.signInAnonymously();
            console.log('Guest sign in successful:', result);
            console.log('User:', result.user);
            console.log('Is anonymous:', result.user.isAnonymous);
            
            // Generate and store guest code
            const guestCode = generateGuestCode();
            localStorage.setItem('guestCode', guestCode);
            console.log('Guest code generated:', guestCode);
        } catch (error) {
            console.error('Guest sign in error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            let errorMessage = 'Failed to sign in as guest. ';
            if (error.code === 'auth/operation-not-allowed') {
                errorMessage += 'Anonymous authentication is not enabled in Firebase console.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMessage += 'Network error. Please check your connection.';
            } else {
                errorMessage += `Error: ${error.message}`;
            }
            
            alert(errorMessage);
        } finally {
            setIsGuestLoading(false);
        }
    }

    return (
        <div className="sign-in-container">
            <div className="sign-in-card">
                <div className="sign-in-header">
                    <div className="discord-brand">
                        <img 
                            className="discord-logo" 
                            src="/SuperChat.png" 
                            alt="SuperChat Logo"
                        />
                    </div>
                    <h1 className="sign-in-title">Welcome back!</h1>
                    <p className="sign-in-subtitle">
                        We're excited to see you again!<br />
                        Sign in to continue to your server.
                    </p>
                </div>
                
                <div className="sign-in-form">
                    <button 
                        className="sign-in-button sign-in-google" 
                        onClick={signInWithGoogle}
                        disabled={isLoading || isGuestLoading}
                    >
                        {isLoading ? 'Signing in...' : 'Sign in with Google'}
                    </button>
                    
                    <div className="sign-in-divider">
                        <span>or</span>
                    </div>
                    
                    <button 
                        className="sign-in-button sign-in-guest" 
                        onClick={signInAsGuest}
                        disabled={isLoading || isGuestLoading}
                    >
                        {isGuestLoading ? 'Signing in...' : 'Continue as Guest'}
                    </button>
                </div>
                
                <div className="sign-in-footer">
                    <p className="sign-in-footer-text">
                        By signing in, you agree to our Terms of Service and Privacy Policy.
                    </p>
                </div>
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
                    <div className="server-header-left">
                        <img 
                            className="server-header-logo" 
                            src="/SuperChat.png" 
                            alt="SuperChat Logo"
                        />
                        <span>SuperChat Server</span>
                    </div>
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
                
                <div className="channel-sidebar-footer">
                    <SignOut />
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
    
    // Try a simpler query first to see if orderBy is causing issues
    const simpleQuery = messagesRef.limit(25);
    const query = messagesRef.orderBy('createdAt').limit(25);

    // Temporarily use simple query to test
    const [messages] = useCollectionData(simpleQuery, { idField: 'id' });
    const [formValue, setFormValue] = useState('');

    // Debug logging for messages
    console.log('=== CHATROOM DEBUG ===');
    console.log('Current channel:', channel);
    console.log('Raw messages from Firestore:', messages);
    console.log('Messages type:', typeof messages);
    console.log('Messages length:', messages ? messages.length : 'null');
    console.log('Query:', query);
    console.log('Simple query:', simpleQuery);

    const sendMessage = async (e) => {
        e.preventDefault();

        console.log('=== SENDING MESSAGE ===');
        console.log('Form value:', formValue);
        console.log('Current channel:', channel);

        const { uid, photoURL, displayName, isAnonymous } = auth.currentUser;
        console.log('User info:', { uid, photoURL, displayName, isAnonymous });

        // Get guest code if user is anonymous
        const guestCode = isAnonymous ? localStorage.getItem('guestCode') : null;
        const displayNameWithCode = isAnonymous 
            ? `Guest ${guestCode || 'XXXX'}` 
            : (displayName || 'Anonymous');

        const messageData = {
            text: formValue,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            uid,
            photoURL,
            displayName: displayNameWithCode,
            channel: channel || 'general',
            guestCode: guestCode || null
        };

        console.log('Message data to send:', messageData);

        try {
            const docRef = await messagesRef.add(messageData);
            console.log('Message sent successfully with ID:', docRef.id);
        } catch (error) {
            console.error('Error sending message:', error);
        }

        setFormValue('');
        dummy.current.scrollIntoView({ behavior: 'smooth' });
    }

    // Filter messages for the current channel
    const filteredMessages = messages ? messages.filter(msg => {
        // If message has channel property, filter by it
        if (msg.channel) {
            return msg.channel === channel;
        }
        // If message doesn't have channel property (old messages), show in general
        return channel === 'general';
    }) : [];

    console.log('Filtered messages count:', filteredMessages.length);
    console.log('Filtered messages:', filteredMessages);

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
    const { text, uid, photoURL, displayName, createdAt, guestCode } = message;
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

    // Determine display name and avatar
    const getDisplayName = () => {
        if (displayName) return displayName;
        if (auth.currentUser?.isAnonymous) return 'Guest';
        return 'Anonymous';
    };

    const getAvatar = () => {
        if (photoURL) return photoURL;
        
        // Generate guest avatar based on guest code
        if (guestCode) {
            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestCode}&backgroundColor=5865f2&textColor=ffffff`;
        }
        
        // Default avatar
        return 'https://api.adorable.io/avatars/23/abott@adorable.png';
    };

    return (
        <div className={`message ${messageClass}`}>
            <img 
                className="message-avatar"
                src={getAvatar()} 
                alt="User avatar"
            />
            <div className="message-content">
                <div className="message-header">
                    <span className={`message-author ${guestCode ? 'guest' : ''}`}>
                        {getDisplayName()}
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
        <button className="sign-out-button" onClick={() => auth.signOut()} title="Sign Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.59L17 17L22 12L17 7Z" fill="currentColor"/>
                <path d="M4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z" fill="currentColor"/>
            </svg>
        </button>
    )
}

export default App;