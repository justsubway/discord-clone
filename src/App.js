import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';

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
const storage = firebase.storage();

// Function to save/update user in Firestore
const saveUserToFirestore = async (user, additionalData = {}) => {
    try {
        // Create unique document ID for guest users
        let documentId = user.uid;
        if (user.isAnonymous && additionalData.guestCode) {
            documentId = `guest_${additionalData.guestCode}`;
        }
        
        const userRef = firestore.collection('users').doc(documentId);
        const userData = {
            uid: user.uid,
            documentId: documentId, // Store the document ID for reference
            displayName: user.displayName || additionalData.displayName || 'User',
            photoURL: user.photoURL || additionalData.photoURL || '',
            email: user.email || '',
            isAnonymous: user.isAnonymous || false,
            guestCode: additionalData.guestCode || null,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            ...additionalData
        };
        
        await userRef.set(userData, { merge: true });
        console.log('User saved to Firestore:', documentId);
    } catch (error) {
        console.error('Error saving user to Firestore:', error);
    }
};

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
            const result = await auth.signInWithPopup(provider);
            
            // Save user to Firestore
            if (result.user) {
                await saveUserToFirestore(result.user);
            }
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
            
            // Save guest user to Firestore
            if (result.user) {
                await saveUserToFirestore(result.user, {
                    displayName: `Guest ${guestCode}`,
                    guestCode: guestCode,
                    isAnonymous: true
                });
            }
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
    const [readChannels, setReadChannels] = useState(new Set(['general'])); // Start with general as read
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showUserPreview, setShowUserPreview] = useState(null);
    const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
    const [members, setMembers] = useState([]);
    
    // Function to get the correct avatar for a member
    const getMemberAvatar = (member) => {
        // First check if member has a photoURL
        if (member.photoURL && member.photoURL !== '') {
            return member.photoURL;
        }
        
        // For guest users, generate avatar based on guest code
        if (member.isAnonymous && member.guestCode) {
            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.guestCode}&backgroundColor=5865f2&textColor=ffffff`;
        }
        
        // Default avatar
        return 'https://api.adorable.io/avatars/32/abott@adorable.png';
    };
    
    // Track unread messages and mentions - use a separate query to avoid conflicts
    const messagesRef = firestore.collection('messages');
    const indicatorQuery = messagesRef.orderBy('createdAt', 'desc').limit(100);
    const [indicatorSnapshot] = useCollection(indicatorQuery);
    
    const indicatorMessages = indicatorSnapshot?.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) || [];
    
    // Mark channel as read when switching to it
    React.useEffect(() => {
        setReadChannels(prev => {
            const newSet = new Set(prev);
            newSet.add(selectedChannel);
            return newSet;
        });
    }, [selectedChannel]);

    // Reset read status when new messages arrive (so indicators can appear again)
    React.useEffect(() => {
        if (!indicatorMessages || !auth.currentUser) return;
        
        const currentUser = auth.currentUser;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        // Check if there are new messages from other users
        const hasNewMessages = indicatorMessages.some(msg => {
            const messageTime = msg.createdAt?.toDate();
            return messageTime && messageTime > tenMinutesAgo && msg.uid !== currentUser.uid;
        });
        
        if (hasNewMessages) {
            // Reset read status for channels with new activity
            setReadChannels(prev => {
                const newSet = new Set(prev);
                // Only keep the currently selected channel as read
                return new Set([selectedChannel]);
            });
        }
    }, [indicatorMessages, selectedChannel, auth.currentUser]);

    // Check for mentions and unread messages
    React.useEffect(() => {
        if (!indicatorMessages || !auth.currentUser) return;
        
        const currentUser = auth.currentUser;
        const newUnreadChannels = new Set();
        const newMentionedChannels = new Set();
        
        // Only check recent messages (last 10 minutes) to avoid false positives
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        indicatorMessages.forEach(msg => {
            const channel = msg.channel || 'general';
            const messageTime = msg.createdAt?.toDate();
            
            // Only process recent messages
            if (!messageTime || messageTime < tenMinutesAgo) return;
            
            // Skip if channel has been read
            if (readChannels.has(channel)) return;
            
            // Check if message is unread (only if it's not from current user)
            if (msg.uid !== currentUser.uid) {
                newUnreadChannels.add(channel);
            }
            
            // Check for mentions (only if message contains @ and is from someone else)
            if (msg.text && msg.text.includes('@') && msg.uid !== currentUser.uid) {
                const isMentioned = isUserMentioned(msg.text, currentUser);
                if (isMentioned) {
                    newMentionedChannels.add(channel);
                }
            }
        });
        
        console.log('🔔 Channel indicators update:', {
            unreadChannels: Array.from(newUnreadChannels),
            mentionedChannels: Array.from(newMentionedChannels),
            readChannels: Array.from(readChannels),
            selectedChannel
        });
        
        setUnreadChannels(newUnreadChannels);
        setMentionedChannels(newMentionedChannels);
    }, [indicatorMessages, readChannels, auth.currentUser]);

    // Load all users from Firestore users collection
    React.useEffect(() => {
        const loadAllUsers = async () => {
            try {
                const usersRef = firestore.collection('users');
                const usersSnapshot = await usersRef.get();
                
                const allUsers = [];
                usersSnapshot.forEach(doc => {
                    const userData = doc.data();
                    allUsers.push({
                        uid: doc.id,
                        displayName: userData.displayName || userData.username || 'Unknown User',
                        photoURL: userData.photoURL || userData.profilePicture || '',
                        guestCode: userData.guestCode || null,
                        isAnonymous: userData.isAnonymous || false,
                        lastSeen: userData.lastSeen || null,
                        createdAt: userData.createdAt || null
                    });
                });
                
                // Sort by last seen (most recent first)
                allUsers.sort((a, b) => {
                    if (!a.lastSeen && !b.lastSeen) return 0;
                    if (!a.lastSeen) return 1;
                    if (!b.lastSeen) return -1;
                    return b.lastSeen.toDate() - a.lastSeen.toDate();
                });
                
                setMembers(allUsers);
            } catch (error) {
                console.error('Error loading users:', error);
            }
        };
        
        loadAllUsers();
    }, []);

    // Also extract members from current messages as backup
    React.useEffect(() => {
        if (!indicatorMessages) return;
        
        const memberMap = new Map();
        indicatorMessages.forEach(msg => {
            if (msg.uid && msg.displayName) {
                // Create unique key for guest users using guest code
                const uniqueKey = msg.guestCode ? `guest_${msg.guestCode}` : msg.uid;
                
                memberMap.set(uniqueKey, {
                    uid: msg.uid,
                    uniqueKey: uniqueKey, // Store the unique key for reference
                    displayName: msg.displayName,
                    photoURL: msg.photoURL,
                    guestCode: msg.guestCode,
                    isAnonymous: msg.guestCode ? true : false
                });
            }
        });
        
        // Merge with existing members, prioritizing stored users
        setMembers(prev => {
            const newMembers = Array.from(memberMap.values());
            const existingMap = new Map(prev.map(member => [member.uniqueKey || member.uid, member]));
            
            // Add new members that aren't already in the list
            newMembers.forEach(member => {
                const key = member.uniqueKey || member.uid;
                if (!existingMap.has(key)) {
                    existingMap.set(key, member);
                }
            });
            
            return Array.from(existingMap.values());
        });
    }, [indicatorMessages]);
    
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
                                className={`channel ${selectedChannel === 'general' ? 'active' : ''} ${selectedChannel !== 'general' && unreadChannels.has('general') ? 'unread' : ''} ${selectedChannel !== 'general' && mentionedChannels.has('general') ? 'mentioned' : ''}`}
                                onClick={() => setSelectedChannel('general')}
                            >
                                <span className="channel-icon">#</span>
                                <span>general</span>
                                {selectedChannel !== 'general' && mentionedChannels.has('general') && (
                                    <span className="mention-indicator">@</span>
                                )}
                                {selectedChannel !== 'general' && unreadChannels.has('general') && !mentionedChannels.has('general') && (
                                    <span className="unread-indicator"></span>
                                )}
                            </div>
                            <div 
                                className={`channel ${selectedChannel === 'random' ? 'active' : ''} ${selectedChannel !== 'random' && unreadChannels.has('random') ? 'unread' : ''} ${selectedChannel !== 'random' && mentionedChannels.has('random') ? 'mentioned' : ''}`}
                                onClick={() => setSelectedChannel('random')}
                            >
                                <span className="channel-icon">#</span>
                                <span>random</span>
                                {selectedChannel !== 'random' && mentionedChannels.has('random') && (
                                    <span className="mention-indicator">@</span>
                                )}
                                {selectedChannel !== 'random' && unreadChannels.has('random') && !mentionedChannels.has('random') && (
                                    <span className="unread-indicator"></span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="channel-sidebar-footer">
                    <UserProfileButton onClick={() => setShowProfileModal(true)} />
                    <SignOut />
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
                <div className="chat-header">
                    <span className="channel-name">#{selectedChannel}</span>
                    <span className="channel-description">General discussion</span>
                </div>
                
                <ChatRoom 
                    channel={selectedChannel} 
                    onUserClick={(user, event) => {
                        const rect = event.target.getBoundingClientRect();
                        setPreviewPosition({ x: rect.right + 10, y: rect.top });
                        setShowUserPreview(user);
                    }}
                />
            </div>

            {/* Members Sidebar */}
            <div className="members-sidebar">
                <div className="members-header">
                    <span>Members — {members.length}</span>
                </div>
                <div className="members-list">
                    {members.map(member => (
                        <div 
                            key={member.uniqueKey || member.uid}
                            className="member-item"
                            onClick={(e) => {
                                const rect = e.target.getBoundingClientRect();
                                setPreviewPosition({ x: rect.left - 300, y: rect.top });
                                setShowUserPreview(member);
                            }}
                        >
                            <img 
                                className="member-avatar"
                                src={getMemberAvatar(member)}
                                alt={member.displayName}
                            />
                            <span className={`member-name ${member.isAnonymous ? 'guest' : ''}`}>
                                {member.displayName}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Profile Modal */}
            {showProfileModal && (
                <ProfileModal 
                    onClose={() => setShowProfileModal(false)} 
                />
            )}

            {/* User Preview Modal */}
            {showUserPreview && (
                <UserPreviewModal 
                    user={showUserPreview}
                    position={previewPosition}
                    onClose={() => setShowUserPreview(null)}
                />
            )}
        </>
    );
}

function ChatRoom({ channel, onUserClick }) {
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
    
    // Debug: Check if messages have IDs (reduced logging)
    React.useEffect(() => {
        if (messages && messages.length > 0) {
            console.log('🔍 Message IDs check:', messages.length, 'messages loaded');
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

    // Track last message ID to detect new messages
    const [lastMessageId, setLastMessageId] = useState(null);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);

    // Check if user is at bottom of scroll
    const isAtBottom = () => {
        if (!messagesContainerRef.current) return true;
        const container = messagesContainerRef.current;
        return container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
    };

    // Auto-scroll to bottom when messages load or change (only if user is at bottom)
    React.useEffect(() => {
        if (messages && messages.length > 0 && !isUserScrolling) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                if (dummy.current && isAtBottom()) {
                    dummy.current.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    }, [messages, isUserScrolling]);

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

    // Handle scroll events to detect user scrolling
    const handleScroll = () => {
        if (messagesContainerRef.current) {
            const atBottom = isAtBottom();
            setIsUserScrolling(!atBottom);
            setShowScrollToBottom(!atBottom);
        }
    };

    // Scroll to bottom function
    const scrollToBottom = () => {
        if (dummy.current) {
            dummy.current.scrollIntoView({ behavior: 'smooth' });
            setIsUserScrolling(false);
            setShowScrollToBottom(false);
        }
    };

    // Check for new mentions and play sound immediately
    React.useEffect(() => {
        if (!messages || messages.length === 0 || !auth.currentUser) return;

        const currentUser = auth.currentUser;
        const latestMessage = messages[0]; // Most recent message (since we order by desc)
        
        // Only check if this is a new message we haven't processed yet
        if (latestMessage.id === lastMessageId) return;
        
        // Update last message ID
        setLastMessageId(latestMessage.id);
        
        // Check if this new message mentions the current user
        if (latestMessage.text && latestMessage.text.includes('@') && latestMessage.uid !== currentUser.uid) {
            const isMentioned = isUserMentioned(latestMessage.text, currentUser);
            if (isMentioned) {
                console.log('🔔 New mention detected! Playing sound immediately.');
                playMentionSound();
            }
        }
    }, [messages, lastMessageId]);

    // Debug logging for messages (reduced)
    console.log('=== CHATROOM DEBUG ===', channel, messages?.length || 0, 'messages');

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
            
            // Update user's last seen time
            await saveUserToFirestore(auth.currentUser, {
                displayName: displayNameWithCode,
                photoURL: photoURL,
                guestCode: guestCode
            });
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

    return (
        <>
            <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
                {filteredMessages.length > 0 ? (
                    filteredMessages.map(msg => <ChatMessage key={msg.id} message={msg} onUserClick={onUserClick} />)
                ) : (
                    <div style={{color: '#8e9297', padding: '20px', textAlign: 'center'}}>
                        <p>No messages in #{channel} yet</p>
                        <p>Be the first to send a message!</p>
                    </div>
                )}
            <span ref={dummy}></span>
            </div>

            {/* Scroll to Bottom Button */}
            {showScrollToBottom && (
                <button 
                    className="scroll-to-bottom-btn"
                    onClick={scrollToBottom}
                    title="Scroll to bottom"
                >
                    ↓
                </button>
            )}

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

function ChatMessage({ message, onUserClick }) {
    // console.log('Rendering ChatMessage:', message);
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
    
    // Note: Sound playing is now handled in ChatRoom component for immediate response
    
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
        // First check if message has a photoURL
        if (photoURL && photoURL !== '') {
            return photoURL;
        }
        
        // For guest users, generate avatar based on guest code
        if (guestCode) {
            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestCode}&backgroundColor=5865f2&textColor=ffffff`;
        }
        
        // Default avatar
        return 'https://api.adorable.io/avatars/40/abott@adorable.png';
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
                    <span 
                        className={`message-author ${guestCode ? 'guest' : ''} clickable`}
                        onClick={(e) => {
                            if (onUserClick) {
                                onUserClick({
                                    uid,
                                    displayName: getDisplayName(),
                                    photoURL: getAvatar(),
                                    guestCode,
                                    isAnonymous: !!guestCode
                                }, e);
                            }
                        }}
                    >
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

function UserProfileButton({ onClick }) {
    const [user] = useAuthState(auth);
    const [userProfile, setUserProfile] = useState(null);
    
    // Get user profile data
    React.useEffect(() => {
        if (!user) return;
        
        const getUserProfile = async () => {
            try {
                // Create unique document ID for guest users
                let documentId = user.uid;
                if (user.isAnonymous) {
                    const guestCode = localStorage.getItem('guestCode');
                    if (guestCode) {
                        documentId = `guest_${guestCode}`;
                    }
                }
                
                const profileRef = firestore.collection('userProfiles').doc(documentId);
                const profileDoc = await profileRef.get();
                
                if (profileDoc.exists) {
                    setUserProfile(profileDoc.data());
                } else {
                    // Create default profile
                    const defaultProfile = {
                        username: user.displayName || (user.isAnonymous ? `Guest ${localStorage.getItem('guestCode') || 'XXXX'}` : 'User'),
                        aboutMe: '',
                        profilePicture: user.photoURL || '',
                        banner: '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await profileRef.set(defaultProfile);
                    setUserProfile(defaultProfile);
                }
            } catch (error) {
                console.error('Error getting user profile:', error);
            }
        };
        
        getUserProfile();
    }, [user]);
    
    const getDisplayName = () => {
        if (userProfile?.username) return userProfile.username;
        if (user?.isAnonymous) {
            const guestCode = localStorage.getItem('guestCode');
            return `Guest ${guestCode || 'XXXX'}`;
        }
        return user?.displayName || 'User';
    };
    
    const getAvatar = () => {
        // First check if user has a custom profile picture
        if (userProfile?.profilePicture && userProfile.profilePicture !== '') {
            return userProfile.profilePicture;
        }
        
        // Check if user has a photoURL from auth
        if (user?.photoURL && user.photoURL !== '') {
            return user.photoURL;
        }
        
        // For guest users, generate avatar based on guest code
        if (user?.isAnonymous) {
            const guestCode = localStorage.getItem('guestCode');
            if (guestCode) {
                return `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestCode}&backgroundColor=5865f2&textColor=ffffff`;
            }
        }
        
        // Default avatar
        return 'https://api.adorable.io/avatars/32/abott@adorable.png';
    };
    
    return (
        <button className="user-profile-button" onClick={onClick} title="User Profile">
            <img 
                className="user-profile-avatar" 
                src={getAvatar()} 
                alt="Profile"
            />
            <div className="user-profile-info">
                <span className="user-profile-name">{getDisplayName()}</span>
                <span className="user-profile-status">Online</span>
            </div>
        </button>
    );
}

function ProfileModal({ onClose }) {
    const [user] = useAuthState(auth);
    const [userProfile, setUserProfile] = useState({
        username: '',
        aboutMe: '',
        profilePicture: '',
        banner: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef(null);
    const bannerInputRef = useRef(null);
    
    // Load user profile data
    React.useEffect(() => {
        if (!user) return;
        
        const loadUserProfile = async () => {
            try {
                // Create unique document ID for guest users
                let documentId = user.uid;
                if (user.isAnonymous) {
                    const guestCode = localStorage.getItem('guestCode');
                    if (guestCode) {
                        documentId = `guest_${guestCode}`;
                    }
                }
                
                const profileRef = firestore.collection('userProfiles').doc(documentId);
                const profileDoc = await profileRef.get();
                
                if (profileDoc.exists) {
                    const data = profileDoc.data();
                    setUserProfile({
                        username: data.username || user.displayName || (user.isAnonymous ? `Guest ${localStorage.getItem('guestCode') || 'XXXX'}` : ''),
                        aboutMe: data.aboutMe || '',
                        profilePicture: data.profilePicture || user.photoURL || '',
                        banner: data.banner || ''
                    });
                } else {
                    // Set default values
                    setUserProfile({
                        username: user.displayName || (user.isAnonymous ? `Guest ${localStorage.getItem('guestCode') || 'XXXX'}` : ''),
                        aboutMe: '',
                        profilePicture: user.photoURL || '',
                        banner: ''
                    });
                }
            } catch (error) {
                console.error('Error loading user profile:', error);
            } finally {
                setLoading(false);
            }
        };
        
        loadUserProfile();
    }, [user]);
    
    // Handle image upload
    const handleImageUpload = async (file, type) => {
        if (!file || !user) return;
        
        setUploadingImage(true);
        try {
            const fileExtension = file.name.split('.').pop();
            const fileName = `${user.uid}_${type}_${Date.now()}.${fileExtension}`;
            const storageRef = storage.ref().child(`profile-images/${fileName}`);
            
            // Add upload progress tracking
            const uploadTask = storageRef.put(file);
            
            uploadTask.on('state_changed', 
                (snapshot) => {
                    // Progress tracking (optional)
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log(`Upload is ${progress}% done`);
                },
                (error) => {
                    console.error('Upload error:', error);
                    alert('Error uploading image. Please try again.');
                    setUploadingImage(false);
                },
                async () => {
                    try {
                        const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                        setUserProfile(prev => ({
                            ...prev,
                            [type]: downloadURL
                        }));
                        setUploadingImage(false);
                    } catch (error) {
                        console.error('Error getting download URL:', error);
                        alert('Error getting image URL. Please try again.');
                        setUploadingImage(false);
                    }
                }
            );
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Error uploading image. Please try again.');
            setUploadingImage(false);
        }
    };
    
    // Handle profile save
    const handleSaveProfile = async () => {
        if (!user) return;
        
        setSaving(true);
        try {
            // Create unique document ID for guest users
            let documentId = user.uid;
            if (user.isAnonymous) {
                const guestCode = localStorage.getItem('guestCode');
                if (guestCode) {
                    documentId = `guest_${guestCode}`;
                }
            }
            
            const profileRef = firestore.collection('userProfiles').doc(documentId);
            await profileRef.set({
                username: userProfile.username,
                aboutMe: userProfile.aboutMe,
                profilePicture: userProfile.profilePicture,
                banner: userProfile.banner,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            onClose();
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Error saving profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };
    
    // Handle input changes
    const handleInputChange = (field, value) => {
        setUserProfile(prev => ({
            ...prev,
            [field]: value
        }));
    };
    
    if (loading) {
        return (
            <div className="profile-modal-overlay">
                <div className="profile-modal">
                    <div className="profile-modal-loading">
                        <div className="loading-spinner"></div>
                        <p>Loading profile...</p>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="profile-modal-overlay" onClick={onClose}>
            <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
                <div className="profile-modal-header">
                    <h2>User Profile</h2>
                    <button className="profile-modal-close" onClick={onClose}>
                        ×
                    </button>
                </div>
                
                <div className="profile-modal-content">
                    {/* Banner Section */}
                    <div className="profile-banner-section">
                        <div 
                            className="profile-banner"
                            style={{
                                backgroundImage: userProfile.banner 
                                    ? `url(${userProfile.banner})` 
                                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                            }}
                        >
                            <input
                                ref={bannerInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    if (e.target.files[0]) {
                                        handleImageUpload(e.target.files[0], 'banner');
                                    }
                                }}
                            />
                            <button 
                                className="banner-upload-btn"
                                onClick={() => bannerInputRef.current?.click()}
                                disabled={uploadingImage}
                            >
                                {uploadingImage ? 'Uploading...' : 'Change Banner'}
                            </button>
                        </div>
                    </div>
                    
                    {/* Profile Picture Section */}
                    <div className="profile-picture-section">
                        <div className="profile-picture-container">
                            <img 
                                className="profile-picture"
                                src={userProfile.profilePicture || 'https://api.adorable.io/avatars/100/abott@adorable.png'}
                                alt="Profile"
                            />
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    if (e.target.files[0]) {
                                        handleImageUpload(e.target.files[0], 'profilePicture');
                                    }
                                }}
                            />
                            <button 
                                className="profile-picture-upload-btn"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingImage}
                            >
                                📷
                            </button>
                        </div>
                    </div>
                    
                    {/* Form Fields */}
                    <div className="profile-form">
                        <div className="profile-field">
                            <label htmlFor="username">Username</label>
                            <input
                                id="username"
                                type="text"
                                value={userProfile.username}
                                onChange={(e) => handleInputChange('username', e.target.value)}
                                placeholder="Enter your username"
                                maxLength={32}
                            />
                        </div>
                        
                        <div className="profile-field">
                            <label htmlFor="aboutMe">About Me</label>
                            <textarea
                                id="aboutMe"
                                value={userProfile.aboutMe}
                                onChange={(e) => handleInputChange('aboutMe', e.target.value)}
                                placeholder="Tell us about yourself..."
                                maxLength={190}
                                rows={4}
                            />
                            <div className="character-count">
                                {userProfile.aboutMe.length}/190
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="profile-modal-footer">
                    <button 
                        className="profile-cancel-btn"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button 
                        className="profile-save-btn"
                        onClick={handleSaveProfile}
                        disabled={saving || uploadingImage}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function UserPreviewModal({ user, position, onClose }) {
    const [userProfile, setUserProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const modalRef = useRef(null);
    
    // Function to get the correct avatar for a user
    const getUserAvatar = (user, userProfile) => {
        // First check if user has a custom profile picture
        if (userProfile?.profilePicture && userProfile.profilePicture !== '') {
            return userProfile.profilePicture;
        }
        
        // Check if user has a photoURL from auth
        if (user.photoURL && user.photoURL !== '') {
            return user.photoURL;
        }
        
        // For guest users, generate avatar based on guest code
        if (user.isAnonymous && user.guestCode) {
            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.guestCode}&backgroundColor=5865f2&textColor=ffffff`;
        }
        
        // Default avatar
        return 'https://api.adorable.io/avatars/100/abott@adorable.png';
    };
    
    // Close modal when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (modalRef.current && !modalRef.current.contains(event.target)) {
                onClose();
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);
    
    // Load user profile data
    React.useEffect(() => {
        if (!user) return;
        
        const loadUserProfile = async () => {
            try {
                // Create unique document ID for guest users
                let documentId = user.uid;
                if (user.isAnonymous && user.guestCode) {
                    documentId = `guest_${user.guestCode}`;
                }
                
                const profileRef = firestore.collection('userProfiles').doc(documentId);
                const profileDoc = await profileRef.get();
                
                if (profileDoc.exists) {
                    setUserProfile(profileDoc.data());
                } else {
                    // Set default values
                    setUserProfile({
                        username: user.displayName,
                        aboutMe: '',
                        profilePicture: user.photoURL,
                        banner: ''
                    });
                }
            } catch (error) {
                console.error('Error loading user profile:', error);
                setUserProfile({
                    username: user.displayName,
                    aboutMe: '',
                    profilePicture: user.photoURL,
                    banner: ''
                });
            } finally {
                setLoading(false);
            }
        };
        
        loadUserProfile();
    }, [user]);
    
    if (loading) {
        return (
            <div 
                className="user-preview-modal"
                style={{
                    position: 'fixed',
                    left: position.x,
                    top: position.y,
                    zIndex: 1001
                }}
            >
                <div className="user-preview-loading">
                    <div className="loading-spinner"></div>
                </div>
            </div>
        );
    }
    
    return (
        <div 
            ref={modalRef}
            className="user-preview-modal"
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: 1001
            }}
        >
            <div className="user-preview-content">
                {/* Banner */}
                <div 
                    className="user-preview-banner"
                    style={{
                        backgroundImage: (userProfile?.banner && userProfile.banner !== '') 
                            ? `url(${userProfile.banner})` 
                            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    }}
                />
                
                {/* Profile Picture */}
                <div className="user-preview-picture-section">
                    <img 
                        className="user-preview-avatar"
                        src={getUserAvatar(user, userProfile)}
                        alt={user.displayName}
                    />
                </div>
                
                {/* User Info */}
                <div className="user-preview-info">
                    <h3 className="user-preview-name">
                        {userProfile?.username || user.displayName}
                    </h3>
                    <div className="user-preview-status">
                        <div className="status-indicator online"></div>
                        <span>Online</span>
                    </div>
                    {userProfile?.aboutMe && (
                        <p className="user-preview-bio">
                            {userProfile.aboutMe}
                        </p>
                    )}
                    {user.isAnonymous && (
                        <div className="user-preview-guest-badge">
                            Guest User
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
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