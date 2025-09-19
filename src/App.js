import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';

import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollectionData, useCollection } from 'react-firebase-hooks/firestore';

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
    const [unreadChannels, setUnreadChannels] = useState(new Set());
    const [mentionedChannels, setMentionedChannels] = useState(new Set());
    
    // Track unread messages and mentions
    const messagesRef = firestore.collection('messages');
    const query = messagesRef.orderBy('createdAt', 'desc').limit(50);
    const [messagesSnapshot] = useCollection(query);
    
    const messages = messagesSnapshot?.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) || [];
    
    // Check for mentions and unread messages
    React.useEffect(() => {
        if (!messages || !auth.currentUser) return;
        
        const currentUser = auth.currentUser;
        const newUnreadChannels = new Set();
        const newMentionedChannels = new Set();
        
        messages.forEach(msg => {
            const channel = msg.channel || 'general';
            
            // Check if message is unread (you can customize this logic)
            // For now, we'll consider messages from the last 5 minutes as "unread"
            const messageTime = msg.createdAt?.toDate();
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            if (messageTime && messageTime > fiveMinutesAgo && msg.uid !== currentUser.uid) {
                newUnreadChannels.add(channel);
            }
            
            // Check for mentions
            if (msg.text && msg.text.includes('@')) {
                const isMentioned = isUserMentioned(msg.text, currentUser);
                if (isMentioned && msg.uid !== currentUser.uid) {
                    newMentionedChannels.add(channel);
                }
            }
        });
        
        setUnreadChannels(newUnreadChannels);
        setMentionedChannels(newMentionedChannels);
    }, [messages]);
    
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
                                className={`channel ${selectedChannel === 'general' ? 'active' : ''} ${unreadChannels.has('general') ? 'unread' : ''} ${mentionedChannels.has('general') ? 'mentioned' : ''}`}
                                onClick={() => setSelectedChannel('general')}
                            >
                                <span className="channel-icon">#</span>
                                <span>general</span>
                                {mentionedChannels.has('general') && (
                                    <span className="mention-indicator">@</span>
                                )}
                                {unreadChannels.has('general') && !mentionedChannels.has('general') && (
                                    <span className="unread-indicator"></span>
                                )}
                            </div>
                            <div 
                                className={`channel ${selectedChannel === 'random' ? 'active' : ''} ${unreadChannels.has('random') ? 'unread' : ''} ${mentionedChannels.has('random') ? 'mentioned' : ''}`}
                                onClick={() => setSelectedChannel('random')}
                            >
                                <span className="channel-icon">#</span>
                                <span>random</span>
                                {mentionedChannels.has('random') && (
                                    <span className="mention-indicator">@</span>
                                )}
                                {unreadChannels.has('random') && !mentionedChannels.has('random') && (
                                    <span className="unread-indicator"></span>
                                )}
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
    const messagesContainerRef = useRef();
    const messagesRef = firestore.collection('messages');
    
    // Use proper query to get the most recent messages
    // Order by createdAt descending to get newest first, then limit to 50
    // Note: Firebase has a limit of 25 by default, but we can increase it
    const query = messagesRef.orderBy('createdAt', 'desc').limit(50);

    const [messagesSnapshot, loading, error] = useCollection(query);
    
    // Convert snapshot to data with IDs
    const messages = messagesSnapshot?.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) || [];
    
    // Debug: Check if messages have IDs
    React.useEffect(() => {
        if (messages && messages.length > 0) {
            console.log('🔍 Message IDs check:', messages.map(msg => ({ id: msg.id, text: msg.text?.substring(0, 20) })));
            console.log('🔍 First message full object:', messages[0]);
        }
    }, [messages]);
    const [formValue, setFormValue] = useState('');

    // Mention system state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPosition, setMentionPosition] = useState(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

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

    // Auto-scroll to bottom when messages load or change
    React.useEffect(() => {
        if (messages && messages.length > 0) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                if (dummy.current) {
                    dummy.current.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    }, [messages]);

    // Auto-scroll to bottom when channel changes
    React.useEffect(() => {
        if (messages && messages.length > 0) {
            setTimeout(() => {
                if (dummy.current) {
                    dummy.current.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    }, [channel]);

    // Debug logging for messages
    console.log('=== CHATROOM DEBUG ===');
    console.log('Current channel:', channel);
    console.log('Raw messages from Firestore:', messages);
    console.log('Messages type:', typeof messages);
    console.log('Messages length:', messages ? messages.length : 'null');
    console.log('Query:', query);
    console.log('Unique users:', uniqueUsers);

    // Handle input change for mention detection
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
        setShowMentionDropdown(false);
        dummy.current.scrollIntoView({ behavior: 'smooth' });
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
            <div className="messages-container" ref={messagesContainerRef}>
                {filteredMessages.length > 0 ? (
                    filteredMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)
                ) : (
                    <div style={{color: '#8e9297', padding: '20px', textAlign: 'center'}}>
                        <p>No messages in #{channel} yet</p>
                        <p>Be the first to send a message!</p>
                    </div>
                )}
            <span ref={dummy}></span>
            </div>

            <div className="message-input-container">
                <form className="message-input-form" onSubmit={sendMessage}>
                    <div className="input-wrapper">
                        <input 
                            className="message-input"
                            value={formValue} 
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={`Message #${channel}`}
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
                        disabled={!formValue}
                    >
                        ➤
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
    const { text, uid, photoURL, displayName, createdAt, guestCode, id, reactions } = message;
    const messageClass = uid === auth.currentUser?.uid ? 'sent' : 'received';
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(text);
    const reactionPickerRef = useRef(null);
    const editInputRef = useRef(null);
    
    // Common emojis for reactions
    const commonEmojis = ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥', '💯'];
    
    // Close reaction picker when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(event.target)) {
                setShowReactionPicker(false);
            }
        };
        
        if (showReactionPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showReactionPicker]);

    // Focus edit input when editing starts
    React.useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [isEditing]);

    // Edit message
    const handleEditMessage = async () => {
        if (!editText.trim() || editText === text) {
            setIsEditing(false);
            setEditText(text);
            return;
        }

        try {
            const messageRef = firestore.collection('messages').doc(id);
            await messageRef.update({
                text: editText.trim(),
                editedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setIsEditing(false);
        } catch (error) {
            console.error('Error editing message:', error);
        }
    };

    // Delete message
    const handleDeleteMessage = async () => {
        if (!window.confirm('Are you sure you want to delete this message?')) {
            return;
        }

        try {
            const messageRef = firestore.collection('messages').doc(id);
            await messageRef.delete();
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    };

    // Handle edit key press
    const handleEditKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleEditMessage();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditText(text);
        }
    };
    
    // Add or remove reaction
    const toggleReaction = async (emoji) => {
        if (!auth.currentUser) {
            console.log('❌ No current user for reaction');
            return;
        }
        
        if (!id) {
            console.error('❌ Message ID is undefined! Cannot add reaction.');
            return;
        }
        
        console.log('🎭 Toggling reaction:', emoji);
        console.log('Message ID:', id);
        console.log('Current reactions:', reactions);
        console.log('Current user UID:', auth.currentUser.uid);
        
        const messageRef = firestore.collection('messages').doc(id);
        const currentReactions = reactions || {};
        const userUid = auth.currentUser.uid;
        
        try {
            // First, let's check if the document exists
            const docSnapshot = await messageRef.get();
            if (!docSnapshot.exists) {
                console.error('❌ Message document does not exist!');
                return;
            }
            console.log('✅ Message document exists');
            
            if (currentReactions[emoji] && currentReactions[emoji].includes(userUid)) {
                console.log('🔄 Removing reaction:', emoji);
                // Remove reaction
                const updatedUsers = currentReactions[emoji].filter(uid => uid !== userUid);
                if (updatedUsers.length === 0) {
                    // Remove emoji entirely if no users left
                    const { [emoji]: removed, ...rest } = currentReactions;
                    await messageRef.update({ reactions: rest });
                    console.log('✅ Removed emoji entirely');
                } else {
                    // Update users list
                    await messageRef.update({
                        [`reactions.${emoji}`]: updatedUsers
                    });
                    console.log('✅ Updated users list:', updatedUsers);
                }
            } else {
                console.log('➕ Adding reaction:', emoji);
                // Add reaction
                const currentUsers = currentReactions[emoji] || [];
                const newUsers = [...currentUsers, userUid];
                
                console.log('Current users for emoji:', currentUsers);
                console.log('New users array:', newUsers);
                
                await messageRef.update({
                    [`reactions.${emoji}`]: newUsers
                });
                console.log('✅ Added reaction with users:', newUsers);
            }
            setShowReactionPicker(false);
        } catch (error) {
            console.error('❌ Error updating reaction:', error);
            console.error('Error details:', error.message);
            console.error('Error code:', error.code);
        }
    };
    
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
                    {isEditing ? (
                        <div className="edit-message-container">
                            <textarea
                                ref={editInputRef}
                                className="edit-message-input"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={handleEditKeyPress}
                                rows="1"
                            />
                            <div className="edit-message-actions">
                                <button 
                                    className="edit-save-btn"
                                    onClick={handleEditMessage}
                                >
                                    Save
                                </button>
                                <button 
                                    className="edit-cancel-btn"
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditText(text);
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {renderTextWithMentions(text)}
                            {message.editedAt && (
                                <span className="edited-indicator">(edited)</span>
                            )}
                        </>
                    )}
                </div>
                
                {/* Reactions */}
                {reactions && Object.keys(reactions).length > 0 && (
                    <div className="message-reactions">
                        {Object.entries(reactions).map(([emoji, userIds]) => (
                            <button
                                key={emoji}
                                className={`reaction ${userIds.includes(auth.currentUser?.uid) ? 'reacted' : ''}`}
                                onClick={() => toggleReaction(emoji)}
                            >
                                <span className="reaction-emoji">{emoji}</span>
                                <span className="reaction-count">{userIds.length}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Message Actions - Side of message */}
            <div className="message-actions">
                <button 
                    className="add-reaction-btn"
                    onClick={() => setShowReactionPicker(!showReactionPicker)}
                    title="Add Reaction"
                >
                    <span className="reaction-icon">😀</span>
                </button>
                
                {/* Edit/Delete buttons for own messages */}
                {uid === auth.currentUser?.uid && !isEditing && (
                    <>
                        <button 
                            className="edit-message-btn"
                            onClick={() => setIsEditing(true)}
                            title="Edit Message"
                        >
                            ✏️
                        </button>
                        <button 
                            className="delete-message-btn"
                            onClick={handleDeleteMessage}
                            title="Delete Message"
                        >
                            🗑️
                        </button>
                    </>
                )}
            </div>
            
            {/* Reaction Picker */}
            {showReactionPicker && (
                <div className="reaction-picker" ref={reactionPickerRef}>
                    <div className="reaction-picker-header">
                        <span>Add Reaction</span>
                        <button 
                            className="close-picker"
                            onClick={() => setShowReactionPicker(false)}
                        >
                            ×
                        </button>
                    </div>
                    <div className="reaction-picker-emojis">
                        {commonEmojis.map(emoji => (
                            <button
                                key={emoji}
                                className="reaction-picker-emoji"
                                onClick={() => toggleReaction(emoji)}
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