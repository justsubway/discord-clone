import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';

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
    
    // Use proper query to get the most recent messages
    // Order by createdAt descending to get newest first, then limit to 50
    // Note: Firebase has a limit of 25 by default, but we can increase it
    const query = messagesRef.orderBy('createdAt', 'desc').limit(50);

    const [messages] = useCollectionData(query, { idField: 'id' });
    const [formValue, setFormValue] = useState('');

    // Mention system state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPosition, setMentionPosition] = useState(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
    
    // File upload state
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    
    // Typing indicators state
    const [typingUsers, setTypingUsers] = useState([]);
    const [isTyping, setIsTyping] = useState(false);
    const typingTimeoutRef = useRef(null);

    // Get unique users from messages for mention autocomplete
    const getUniqueUsers = () => {
        if (!messages) return [];
        const userMap = new Map();
        messages.forEach(msg => {
            if (msg.displayName && msg.uid) {
                userMap.set(msg.uid, {
                    displayName: msg.displayName,
                    uid: msg.uid,
                    photoURL: msg.photoURL
                });
            }
        });
        return Array.from(userMap.values());
    };

    const uniqueUsers = getUniqueUsers();

    // Filter users based on mention query
    const filteredUsers = uniqueUsers.filter(user => 
        user.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
    );

    // Listen to typing indicators
    React.useEffect(() => {
        const typingRef = firestore.collection('typing');
        const unsubscribe = typingRef
            .where('channel', '==', channel)
            .onSnapshot((snapshot) => {
                const typingData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                // Filter out current user and expired typing indicators
                const now = new Date();
                const validTyping = typingData.filter(data => {
                    const isNotCurrentUser = data.uid !== auth.currentUser?.uid;
                    const isRecent = data.timestamp && 
                        (now - data.timestamp.toDate()) < 5000; // 5 seconds
                    return isNotCurrentUser && isRecent;
                });
                
                setTypingUsers(validTyping);
            });

        return () => unsubscribe();
    }, [channel]);

    // Cleanup typing status on unmount
    React.useEffect(() => {
        return () => {
            if (isTyping) {
                updateTypingStatus(false);
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, [isTyping]);

    // Debug logging for messages
    console.log('=== CHATROOM DEBUG ===');
    console.log('Current channel:', channel);
    console.log('Raw messages from Firestore:', messages);
    console.log('Messages type:', typeof messages);
    console.log('Messages length:', messages ? messages.length : 'null');
    console.log('Query:', query);
    console.log('Unique users:', uniqueUsers);

    // Handle input change for mention detection and typing indicators
    const handleInputChange = (e) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;
        
        // Check for @ mention
        const textBeforeCursor = value.substring(0, cursorPosition);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            setShowMentionDropdown(true);
            setMentionQuery(mentionMatch[1]);
            setMentionPosition(cursorPosition - mentionMatch[1].length - 1);
            setSelectedMentionIndex(0);
        } else {
            setShowMentionDropdown(false);
            setMentionQuery('');
        }
        
        setFormValue(value);
        
        // Handle typing indicators
        if (value.trim() && !isTyping) {
            setIsTyping(true);
            updateTypingStatus(true);
        } else if (!value.trim() && isTyping) {
            setIsTyping(false);
            updateTypingStatus(false);
        }
        
        // Reset typing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        
        // Set timeout to stop typing indicator
        typingTimeoutRef.current = setTimeout(() => {
            if (isTyping) {
                setIsTyping(false);
                updateTypingStatus(false);
            }
        }, 3000);
    };

    // Update typing status in Firestore
    const updateTypingStatus = async (typing) => {
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) return;
            
            const typingRef = firestore.collection('typing').doc(`${channel}_${currentUser.uid}`);
            
            if (typing) {
                const { displayName, isAnonymous } = currentUser;
                const guestCode = isAnonymous ? localStorage.getItem('guestCode') : null;
                const displayNameWithCode = isAnonymous 
                    ? `Guest ${guestCode || 'XXXX'}` 
                    : (displayName || 'Anonymous');
                
                await typingRef.set({
                    uid: currentUser.uid,
                    displayName: displayNameWithCode,
                    channel: channel,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await typingRef.delete();
            }
        } catch (error) {
            console.error('Error updating typing status:', error);
        }
    };

    // Handle mention selection
    const handleMentionSelect = (user) => {
        const textBeforeMention = formValue.substring(0, mentionPosition);
        const textAfterMention = formValue.substring(mentionPosition + mentionQuery.length + 1);
        const newValue = textBeforeMention + `@${user.displayName} ` + textAfterMention;
        
        setFormValue(newValue);
        setShowMentionDropdown(false);
        setMentionQuery('');
    };

    // Handle keyboard navigation in mention dropdown
    const handleKeyDown = (e) => {
        if (!showMentionDropdown) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedMentionIndex(prev => 
                prev < filteredUsers.length - 1 ? prev + 1 : 0
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedMentionIndex(prev => 
                prev > 0 ? prev - 1 : filteredUsers.length - 1
            );
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredUsers[selectedMentionIndex]) {
                handleMentionSelect(filteredUsers[selectedMentionIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowMentionDropdown(false);
        }
    };

    // Handle file selection
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                alert('File size must be less than 10MB');
                return;
            }
            setSelectedFile(file);
        }
    };

    // Handle file upload
    const uploadFile = async (file) => {
        const storage = firebase.storage();
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`uploads/${Date.now()}_${file.name}`);
        
        try {
            const snapshot = await fileRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            return downloadURL;
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();

        console.log('=== SENDING MESSAGE ===');
        console.log('Form value:', formValue);
        console.log('Current channel:', channel);
        console.log('Selected file:', selectedFile);

        const { uid, photoURL, displayName, isAnonymous } = auth.currentUser;
        console.log('User info:', { uid, photoURL, displayName, isAnonymous });

        // Get guest code if user is anonymous
        const guestCode = isAnonymous ? localStorage.getItem('guestCode') : null;
        const displayNameWithCode = isAnonymous 
            ? `Guest ${guestCode || 'XXXX'}` 
            : (displayName || 'Anonymous');

        setIsUploading(true);

        try {
            let fileURL = null;
            let fileType = null;
            let fileName = null;

            // Upload file if selected
            if (selectedFile) {
                fileURL = await uploadFile(selectedFile);
                fileType = selectedFile.type;
                fileName = selectedFile.name;
            }

            const messageData = {
                text: formValue,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                uid,
                photoURL,
                displayName: displayNameWithCode,
                channel: channel || 'general',
                guestCode: guestCode || null,
                ...(fileURL && { 
                    fileURL, 
                    fileType, 
                    fileName,
                    isFile: true 
                })
            };

            console.log('Message data to send:', messageData);

            const docRef = await messagesRef.add(messageData);
            console.log('Message sent successfully with ID:', docRef.id);

            // Reset form
            setFormValue('');
            setSelectedFile(null);
            setShowMentionDropdown(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            dummy.current.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message. Please try again.');
        } finally {
            setIsUploading(false);
        }
    }

    // Filter messages for the current channel and reverse to show chronological order
    const filteredMessages = messages ? messages
        .filter(msg => {
            // If message has channel property, filter by it
            if (msg.channel) {
                return msg.channel === channel;
            }
            // If message doesn't have channel property (old messages), show in general
            return channel === 'general';
        })
        .reverse() // Reverse to show oldest to newest (chronological order)
        : [];

    console.log('Filtered messages count:', filteredMessages.length);
    console.log('Filtered messages:', filteredMessages);
    
    // Debug: Check if messages have the required properties
    if (filteredMessages.length > 0) {
        console.log('First filtered message:', filteredMessages[0]);
        console.log('Last filtered message:', filteredMessages[filteredMessages.length - 1]);
        console.log('Message has text:', !!filteredMessages[0].text);
        console.log('Message has id:', !!filteredMessages[0].id);
        console.log('Total messages in database:', messages ? messages.length : 0);
    }

    return (
        <>
            <div className="messages-container">
                {filteredMessages.length > 0 ? (
                    filteredMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)
                ) : (
                    <div style={{color: '#8e9297', padding: '20px', textAlign: 'center'}}>
                        <p>No messages in #{channel} yet</p>
                        <p>Be the first to send a message!</p>
                    </div>
                )}
                {typingUsers.length > 0 && (
                    <div className="typing-indicator">
                        <div className="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                        <span className="typing-text">
                            {typingUsers.length === 1 
                                ? `${typingUsers[0].displayName} is typing...`
                                : `${typingUsers.length} people are typing...`
                            }
                        </span>
                    </div>
                )}
                <span ref={dummy}></span>
            </div>

            <div className="message-input-container">
                {selectedFile && (
                    <div className="file-preview">
                        <span className="file-name">📎 {selectedFile.name}</span>
                        <button 
                            type="button" 
                            onClick={() => {
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="remove-file"
                        >
                            ×
                        </button>
                    </div>
                )}
                <form className="message-input-form" onSubmit={sendMessage}>
                    <div className="input-wrapper">
                        <input 
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            className="file-input"
                            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                            style={{ display: 'none' }}
                        />
                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="file-upload-button"
                            title="Upload file"
                        >
                            📎
                        </button>
                        <input 
                            className="message-input"
                            value={formValue} 
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={`Message #${channel}`}
                            disabled={isUploading}
                        />
                        {showMentionDropdown && filteredUsers.length > 0 && (
                            <div className="mention-dropdown">
                                {filteredUsers.map((user, index) => (
                                    <div
                                        key={user.uid}
                                        className={`mention-item ${index === selectedMentionIndex ? 'selected' : ''}`}
                                        onClick={() => handleMentionSelect(user)}
                                    >
                                        <img 
                                            className="mention-avatar" 
                                            src={user.photoURL || 'https://api.adorable.io/avatars/23/abott@adorable.png'} 
                                            alt={user.displayName}
                                        />
                                        <span className="mention-name">{user.displayName}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button 
                        type="submit" 
                        className="message-send-button"
                        disabled={(!formValue && !selectedFile) || isUploading}
                    >
                        {isUploading ? '⏳' : '➤'}
                    </button>
                </form>
            </div>
        </>
    )
}

// Function to get or create the played sound messages set
const getPlayedSoundMessages = () => {
    if (!window.playedSoundMessages) {
        window.playedSoundMessages = new Set();
    }
    return window.playedSoundMessages;
};

// Function to play mention sound
const playMentionSound = () => {
    try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Could not play mention sound:', error);
    }
};

// Function to check if current user is mentioned in a message
const isUserMentioned = (messageText, currentUser) => {
    if (!currentUser || !messageText) return false;
    
    // Quick check: if message doesn't contain @, no mention possible
    if (!messageText.includes('@')) return false;
    
    // Get the current user's display name (handle both regular and guest users)
    let displayName;
    if (currentUser.isAnonymous) {
        const guestCode = localStorage.getItem('guestCode');
        displayName = `Guest ${guestCode || 'XXXX'}`;
    } else {
        displayName = currentUser.displayName || 'Anonymous';
    }
    
    // Create a regex pattern that matches @displayName with word boundaries
    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentionPattern = new RegExp(`@${escapedName}\\b`, 'i');
    
    const isMentioned = mentionPattern.test(messageText);
    
    // Only log when actually mentioned to reduce console spam
    if (isMentioned) {
        console.log('✅ User mentioned!', {
            messageText,
            displayName,
            pattern: mentionPattern
        });
    }
    
    return isMentioned;
};

function ChatMessage({ message }) {
    console.log('Rendering ChatMessage:', message);
    const { text, uid, photoURL, displayName, createdAt, guestCode, id, fileURL, fileType, fileName, isFile } = message;
    const messageClass = uid === auth.currentUser?.uid ? 'sent' : 'received';
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(text);
    const [showActions, setShowActions] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    
    // Check if current user is mentioned and play sound (only once per message)
    React.useEffect(() => {
        const isMentioned = isUserMentioned(text, auth.currentUser);
        const isNotMyMessage = uid !== auth.currentUser?.uid;
        const messageKey = `${id}-${text}`; // Unique key for this specific message
        const playedSoundMessages = getPlayedSoundMessages();
        const notPlayedYet = !playedSoundMessages.has(messageKey);
        
        console.log('🔍 Sound check for message:', {
            messageText: text,
            messageUid: uid,
            currentUserUid: auth.currentUser?.uid,
            isMentioned,
            isNotMyMessage,
            notPlayedYet,
            messageKey,
            shouldPlay: isMentioned && isNotMyMessage && notPlayedYet,
            playedSoundMessagesSize: playedSoundMessages.size
        });
        
        // Only play sound if:
        // 1. Current user is mentioned in the message
        // 2. This is NOT my message (someone else sent it)
        // 3. Sound hasn't been played for this message yet
        if (isMentioned && isNotMyMessage && notPlayedYet) {
            console.log('🎵 Playing mention sound!');
            playMentionSound();
            playedSoundMessages.add(messageKey);
            console.log('✅ Sound marked as played for message:', messageKey);
        } else {
            console.log('❌ Sound not played. Reasons:', {
                isMentioned,
                isNotMyMessage,
                notPlayedYet
            });
        }
    }, [text, id, uid]);

    // Handle message editing
    const handleEdit = () => {
        setIsEditing(true);
        setEditText(text);
    };

    const handleSaveEdit = async () => {
        if (editText.trim() === '') return;
        
        try {
            await firestore.collection('messages').doc(id).update({
                text: editText.trim(),
                editedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setIsEditing(false);
        } catch (error) {
            console.error('Error editing message:', error);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditText(text);
    };

    // Handle message deletion
    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this message?')) {
            try {
                await firestore.collection('messages').doc(id).delete();
            } catch (error) {
                console.error('Error deleting message:', error);
            }
        }
    };

    // Handle emoji reactions
    const handleReaction = async (emoji) => {
        try {
            const reactions = message.reactions || {};
            const currentUserUid = auth.currentUser?.uid;
            
            if (reactions[emoji]) {
                // Toggle reaction
                if (reactions[emoji].includes(currentUserUid)) {
                    // Remove user from reaction
                    const updatedUsers = reactions[emoji].filter(uid => uid !== currentUserUid);
                    if (updatedUsers.length === 0) {
                        // Remove emoji if no users left
                        const { [emoji]: removed, ...rest } = reactions;
                        await firestore.collection('messages').doc(id).update({
                            reactions: rest
                        });
                    } else {
                        // Update users list
                        await firestore.collection('messages').doc(id).update({
                            [`reactions.${emoji}`]: updatedUsers
                        });
                    }
                } else {
                    // Add user to reaction
                    await firestore.collection('messages').doc(id).update({
                        [`reactions.${emoji}`]: [...reactions[emoji], currentUserUid]
                    });
                }
            } else {
                // Add new reaction
                await firestore.collection('messages').doc(id).update({
                    [`reactions.${emoji}`]: [currentUserUid]
                });
            }
            setShowReactionPicker(false);
        } catch (error) {
            console.error('Error updating reaction:', error);
        }
    };
    
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

    // Function to render text with mentions
    const renderTextWithMentions = (text) => {
        if (!text) return '';
        
        // Split text by mentions and render each part
        const parts = text.split(/(@\w+)/g);
        
        return parts.map((part, index) => {
            if (part.startsWith('@')) {
                return (
                    <span key={index} className="mention-text">
                        {part}
                    </span>
                );
            }
            return part;
        });
    };

    // Common emojis for reactions
    const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '💯', '👏'];

    // Render reactions
    const renderReactions = () => {
        const reactions = message.reactions || {};
        const currentUserUid = auth.currentUser?.uid;
        
        return Object.entries(reactions).map(([emoji, users]) => {
            const isUserReacted = users.includes(currentUserUid);
            return (
                <div 
                    key={emoji} 
                    className={`reaction ${isUserReacted ? 'reacted' : ''}`}
                    onClick={() => handleReaction(emoji)}
                >
                    <span className="reaction-emoji">{emoji}</span>
                    <span className="reaction-count">{users.length}</span>
                </div>
            );
        });
    };

    // Render file content
    const renderFile = () => {
        if (!isFile || !fileURL) return null;

        const isImage = fileType?.startsWith('image/');
        const isVideo = fileType?.startsWith('video/');
        const isAudio = fileType?.startsWith('audio/');

        return (
            <div className="file-attachment">
                {isImage ? (
                    <img 
                        src={fileURL} 
                        alt={fileName || 'Image'} 
                        className="file-image"
                        onClick={() => window.open(fileURL, '_blank')}
                    />
                ) : isVideo ? (
                    <video 
                        src={fileURL} 
                        controls 
                        className="file-video"
                        onClick={() => window.open(fileURL, '_blank')}
                    />
                ) : isAudio ? (
                    <audio 
                        src={fileURL} 
                        controls 
                        className="file-audio"
                    />
                ) : (
                    <div 
                        className="file-download"
                        onClick={() => window.open(fileURL, '_blank')}
                    >
                        <div className="file-icon">📄</div>
                        <div className="file-info">
                            <div className="file-name">{fileName || 'File'}</div>
                            <div className="file-type">{fileType || 'Unknown type'}</div>
                        </div>
                        <div className="download-icon">⬇️</div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div 
            className={`message ${messageClass}`}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
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
                        {message.editedAt && ' (edited)'}
                    </span>
                </div>
                <div className="message-text">
                    {isEditing ? (
                        <div className="edit-form">
                            <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit();
                                    if (e.key === 'Escape') handleCancelEdit();
                                }}
                                className="edit-input"
                                autoFocus
                            />
                            <div className="edit-buttons">
                                <button onClick={handleSaveEdit} className="edit-save">Save</button>
                                <button onClick={handleCancelEdit} className="edit-cancel">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {renderTextWithMentions(text)}
                            {renderFile()}
                        </>
                    )}
                </div>
                {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className="message-reactions">
                        {renderReactions()}
                    </div>
                )}
            </div>
            {showActions && !isEditing && (
                <div className="message-actions">
                    <button 
                        onClick={() => setShowReactionPicker(!showReactionPicker)} 
                        className="action-button reaction-button" 
                        title="Add Reaction"
                    >
                        😀
                    </button>
                    {uid === auth.currentUser?.uid && (
                        <>
                            <button onClick={handleEdit} className="action-button edit-button" title="Edit">
                                ✏️
                            </button>
                            <button onClick={handleDelete} className="action-button delete-button" title="Delete">
                                🗑️
                            </button>
                        </>
                    )}
                </div>
            )}
            {showReactionPicker && (
                <div className="reaction-picker">
                    <div className="reaction-picker-header">
                        <span>Add Reaction</span>
                        <button 
                            onClick={() => setShowReactionPicker(false)}
                            className="close-picker"
                        >
                            ×
                        </button>
                    </div>
                    <div className="reaction-picker-emojis">
                        {commonEmojis.map(emoji => (
                            <button
                                key={emoji}
                                className="reaction-picker-emoji"
                                onClick={() => handleReaction(emoji)}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}
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