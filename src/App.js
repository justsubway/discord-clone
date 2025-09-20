import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/storage';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
const storageV9 = getStorage();

// Simple event system for profile updates
const profileUpdateListeners = new Set();

const addProfileUpdateListener = (callback) => {
    profileUpdateListeners.add(callback);
    return () => profileUpdateListeners.delete(callback);
};

const triggerProfileUpdate = () => {
    profileUpdateListeners.forEach(callback => callback());
};

// Role system - Secure role assignment based on Firebase UID
const ROLE_SYSTEM = {
    // Admin UIDs - Add your Firebase UIDs here for admin access
    ADMINS: [
        // Add admin UIDs here - these will have full permissions
        // Example: 'firebase-uid-1', 'firebase-uid-2'
        'RIcaIxIG0xZBiAbmchmU3s4ryku2',
    ],
    
    // Moderator UIDs - Add your Firebase UIDs here for moderator access
    MODERATORS: [
        // Add moderator UIDs here - these will have moderation permissions
        // Example: 'firebase-uid-3', 'firebase-uid-4'
    ],
    
    // Role hierarchy (higher number = higher permission)
    ROLES: {
        USER: { level: 0, name: 'User', color: '#8e9297', icon: '👤' },
        MODERATOR: { level: 1, name: 'Moderator', color: '#faa61a', icon: '🛡️' },
        ADMIN: { level: 2, name: 'Admin', color: '#f04747', icon: '👑' }
    }
};

// Function to get user role
const getUserRole = (user) => {
    if (!user || !user.uid) return ROLE_SYSTEM.ROLES.USER;
    
    if (ROLE_SYSTEM.ADMINS.includes(user.uid)) {
        return ROLE_SYSTEM.ROLES.ADMIN;
    }
    
    if (ROLE_SYSTEM.MODERATORS.includes(user.uid)) {
        return ROLE_SYSTEM.ROLES.MODERATOR;
    }
    
    return ROLE_SYSTEM.ROLES.USER;
};

// Function to check if user has permission
const hasPermission = (user, permission) => {
    const role = getUserRole(user);
    
    switch (permission) {
        case 'delete_messages':
            return role.level >= ROLE_SYSTEM.ROLES.MODERATOR.level;
        case 'create_channels':
            return role.level >= ROLE_SYSTEM.ROLES.MODERATOR.level;
        case 'manage_roles':
            return role.level >= ROLE_SYSTEM.ROLES.ADMIN.level;
        case 'delete_channels':
            return role.level >= ROLE_SYSTEM.ROLES.ADMIN.level;
        default:
            return false;
    }
};

// Function to save/update user in Firestore
const saveUserToFirestore = async (user, additionalData = {}) => {
    try {
        // Create unique document ID for guest users
        let documentId = user.uid;
        if (user.isAnonymous && additionalData.guestCode) {
            documentId = `guest_${additionalData.guestCode}`;
        }
        
        const userRef = firestore.collection('users').doc(documentId);
        const userRole = getUserRole(user);
        const userData = {
            uid: user.uid,
            documentId: documentId, // Store the document ID for reference
            displayName: user.displayName || additionalData.displayName || 'User',
            photoURL: user.photoURL || additionalData.photoURL || '',
            email: user.email || '',
            isAnonymous: user.isAnonymous || false,
            guestCode: additionalData.guestCode || null,
            role: userRole.name,
            roleLevel: userRole.level,
            roleColor: userRole.color,
            roleIcon: userRole.icon,
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
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [unreadChannels, setUnreadChannels] = useState(new Set());
    const [mentionedChannels, setMentionedChannels] = useState(new Set());
    const [readChannels, setReadChannels] = useState(new Set()); // Start with no read channels
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showUserPreview, setShowUserPreview] = useState(null);
    const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
      const [members, setMembers] = useState([]);
      const [channels, setChannels] = useState([]); // Start with no channels
      const [channelsLoaded, setChannelsLoaded] = useState(false);
      const [showCreateChannel, setShowCreateChannel] = useState(false);
      const [newChannelName, setNewChannelName] = useState('');
      const [newChannelCategory, setNewChannelCategory] = useState('General');
      const [showCreateCategory, setShowCreateCategory] = useState(false);
      const [newCategoryName, setNewCategoryName] = useState('');
      const [categories, setCategories] = useState(['General', 'Gaming', 'Music', 'Art']);
    
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

    // Load channels from Firestore
    const loadChannels = async () => {
        try {
            const channelsRef = firestore.collection('channels').doc('main');
            const channelsDoc = await channelsRef.get();
            
            if (channelsDoc.exists) {
                const channelsData = channelsDoc.data();
                setChannels(channelsData.channels || []);
                setCategories(channelsData.categories || ['General', 'Gaming', 'Music', 'Art']);
            } else {
                // Create empty channels document
                const defaultCategories = ['General', 'Gaming', 'Music', 'Art'];
                await channelsRef.set({
                    channels: [],
                    categories: defaultCategories,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                setChannels([]);
                setCategories(defaultCategories);
            }
            setChannelsLoaded(true);
        } catch (error) {
            console.error('Error loading channels:', error);
            setChannelsLoaded(true);
        }
    };

    // Save channels to Firestore
    const saveChannels = async (newChannels, newCategories = null) => {
        try {
            const channelsRef = firestore.collection('channels').doc('main');
            const updateData = {
                channels: newChannels,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (newCategories) {
                updateData.categories = newCategories;
            }
            await channelsRef.set(updateData, { merge: true });
        } catch (error) {
            console.error('Error saving channels:', error);
        }
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
        const currentUserId = currentUser.uid;
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
            if (msg.uid !== currentUserId) {
                newUnreadChannels.add(channel);
            }
            
            // Check for mentions (only if message contains @ and is from someone else)
            if (msg.text && msg.text.includes('@') && msg.uid !== currentUserId) {
                const isMentioned = isUserMentioned(msg.text, currentUser);
                if (isMentioned) {
                    newMentionedChannels.add(channel);
                }
            }
        });
        
        // console.log('🔔 Channel indicators update:', {
        //     unreadChannels: Array.from(newUnreadChannels),
        //     mentionedChannels: Array.from(newMentionedChannels),
        //     readChannels: Array.from(readChannels),
        //     selectedChannel
        // });
        
        setUnreadChannels(newUnreadChannels);
        setMentionedChannels(newMentionedChannels);
    }, [indicatorMessages]);

    // Load all users from Firestore users collection
    const loadAllUsers = async () => {
        try {
            const usersRef = firestore.collection('users');
            const usersSnapshot = await usersRef.get();
            
            const allUsers = [];
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                
                // Get role information from database or calculate it
                let role, roleLevel, roleColor, roleIcon;
                if (userData.role && userData.role !== 'undefined') {
                    // Use role information from database
                    role = userData.role;
                    roleLevel = userData.roleLevel || 0;
                    roleColor = userData.roleColor || '#8e9297';
                    roleIcon = userData.roleIcon || '👤';
                } else {
                    // Calculate role information for users who don't have it stored yet
                    const userForRoleCalc = {
                        uid: userData.uid || doc.id,
                        isAnonymous: userData.isAnonymous || false,
                        guestCode: userData.guestCode || null
                    };
                    
                    // Calculate role information for users who don't have it stored yet
                    const calculatedRole = getUserRole(userForRoleCalc);
                    
                    role = calculatedRole.name;
                    roleLevel = calculatedRole.level;
                    roleColor = calculatedRole.color;
                    roleIcon = calculatedRole.icon;
                }
                
                // Ensure we always have valid role information
                if (!role || role === 'undefined') {
                    role = 'User';
                    roleLevel = 0;
                    roleColor = '#8e9297';
                    roleIcon = '👤';
                }
                
                allUsers.push({
                    uid: userData.uid || doc.id,
                    uniqueKey: doc.id,
                    displayName: userData.displayName || userData.username || 'Unknown User',
                    photoURL: userData.photoURL || userData.profilePicture || '',
                    guestCode: userData.guestCode || null,
                    isAnonymous: userData.isAnonymous || false,
                    lastSeen: userData.lastSeen || null,
                    createdAt: userData.createdAt || null,
                    role: role,
                    roleLevel: roleLevel,
                    roleColor: roleColor,
                    roleIcon: roleIcon
                });
            });
            
            // Sort by role level (highest first), then by last seen
            allUsers.sort((a, b) => {
                // First sort by role level (higher role = higher position)
                const roleLevelA = a.roleLevel || 0;
                const roleLevelB = b.roleLevel || 0;
                if (roleLevelA !== roleLevelB) {
                    return roleLevelB - roleLevelA;
                }
                
                // Then sort by last seen (most recent first)
                if (!a.lastSeen && !b.lastSeen) return 0;
                if (!a.lastSeen) return 1;
                if (!b.lastSeen) return -1;
                return b.lastSeen.toDate() - a.lastSeen.toDate();
            });
            
            console.log('Loaded users:', allUsers.length, 'users');
            console.log('Users by role:', {
                admins: allUsers.filter(u => u.role === 'Admin').length,
                moderators: allUsers.filter(u => u.role === 'Moderator').length,
                users: allUsers.filter(u => u.role === 'User').length,
                undefined: allUsers.filter(u => !u.role || u.role === 'undefined').length
            });
            setMembers(allUsers);
            
            // Update users who don't have role information in the database
            const usersToUpdate = allUsers.filter(user => {
                const userData = usersSnapshot.docs.find(doc => doc.id === user.uniqueKey)?.data();
                return !userData?.role;
            });
            
            if (usersToUpdate.length > 0) {
                console.log('Updating role information for', usersToUpdate.length, 'users');
                const batch = firestore.batch();
                usersToUpdate.forEach(user => {
                    const userRef = firestore.collection('users').doc(user.uniqueKey);
                    batch.update(userRef, {
                        role: user.role,
                        roleLevel: user.roleLevel,
                        roleColor: user.roleColor,
                        roleIcon: user.roleIcon,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    React.useEffect(() => {
        loadAllUsers();
        loadChannels();
    }, []);

    // Listen for profile updates
    React.useEffect(() => {
        const unsubscribe = addProfileUpdateListener(loadAllUsers);
        return unsubscribe;
    }, []);

    // Create new channel
    const createChannel = async () => {
        if (!newChannelName.trim()) return;
        
        // Allow emojis and more characters in channel names
        const channelName = newChannelName.trim();
        if (!channelName) {
            alert('Channel name cannot be empty');
            return;
        }
        
        // Basic validation - no empty names or just spaces
        if (channelName.length < 1 || channelName.length > 50) {
            alert('Channel name must be between 1 and 50 characters');
            return;
        }
        
        if (channels.some(ch => ch.name === channelName)) {
            alert('Channel already exists');
            return;
        }
        
        try {
            // Add channel to local state
            const newChannel = { name: channelName, category: newChannelCategory };
            const newChannels = [...channels, newChannel];
            setChannels(newChannels);
            setNewChannelName('');
            setNewChannelCategory('General');
            setShowCreateChannel(false);
            
            // Save to Firestore
            await saveChannels(newChannels);
            
            // Switch to new channel
            setSelectedChannel(channelName);
            
            // Add to read channels
            setReadChannels(prev => new Set([...prev, channelName]));
        } catch (error) {
            console.error('Error creating channel:', error);
            alert('Error creating channel');
        }
    };

    // Delete channel
    const deleteChannel = async (channelName) => {
        if (!hasPermission(auth.currentUser, 'delete_channels')) {
            alert('You do not have permission to delete channels');
            return;
        }
        
        // No default channels to protect
        
        if (!window.confirm(`Are you sure you want to delete #${channelName}? This action cannot be undone.`)) {
            return;
        }
        
        try {
            // Remove channel from local state
            const newChannels = channels.filter(ch => ch.name !== channelName);
            setChannels(newChannels);
            
            // Save to Firestore
            await saveChannels(newChannels);
            
            // If the deleted channel was selected, clear selection
            if (selectedChannel === channelName) {
                setSelectedChannel(null);
            }
            
            // Remove from read channels
            setReadChannels(prev => {
                const newSet = new Set(prev);
                newSet.delete(channelName);
                return newSet;
            });
            
            // Remove from unread channels
            setUnreadChannels(prev => {
                const newSet = new Set(prev);
                newSet.delete(channelName);
                return newSet;
            });
            
            // Remove from mentioned channels
            setMentionedChannels(prev => {
                const newSet = new Set(prev);
                newSet.delete(channelName);
                return newSet;
            });
            
            // TODO: In a real app, you would also delete all messages from this channel from Firestore
            // For now, we'll just remove it from the UI
            
        } catch (error) {
            console.error('Error deleting channel:', error);
            alert('Error deleting channel');
        }
    };

    // Create new category
    const createCategory = async () => {
        if (!newCategoryName.trim()) return;
        
        const categoryName = newCategoryName.trim();
        if (categories.includes(categoryName)) {
            alert('Category already exists');
            return;
        }
        
        try {
            const newCategories = [...categories, categoryName];
            setCategories(newCategories);
            setNewCategoryName('');
            setShowCreateCategory(false);
            
            // Save to Firestore
            await saveChannels(channels, newCategories);
        } catch (error) {
            console.error('Error creating category:', error);
        }
    };

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
                    {/* Empty state when no channels exist */}
                    {channels.length === 0 ? (
                        <div className="empty-channels-state">
                            <div className="empty-channels-icon">💬</div>
                            <div className="empty-channels-title">No channels yet</div>
                            <div className="empty-channels-description">
                                Create your first channel to get started!
                            </div>
                        </div>
                    ) : (
                        /* Render channels grouped by category */
                        categories.map(category => {
                            const categoryChannels = channels.filter(ch => ch.category === category);
                            if (categoryChannels.length === 0) return null;
                            
                            return (
                                <div key={category} className="category">
                                    <div className="category-header">
                                        <span className="category-name">{category}</span>
                                        <span className="category-count">{categoryChannels.length}</span>
                                    </div>
                                    <div className="channel-list">
                                        {categoryChannels.map(channel => (
                                            <div 
                                                key={channel.name}
                                                className={`channel ${selectedChannel === channel.name ? 'active' : ''} ${selectedChannel !== channel.name && unreadChannels.has(channel.name) ? 'unread' : ''} ${selectedChannel !== channel.name && mentionedChannels.has(channel.name) ? 'mentioned' : ''}`}
                                                onClick={() => setSelectedChannel(channel.name)}
                                            >
                                                <span className="channel-icon">#</span>
                                                <span className="channel-name">{channel.name}</span>
                                                {selectedChannel !== channel.name && mentionedChannels.has(channel.name) && (
                                                    <span className="mention-indicator">@</span>
                                                )}
                                                {selectedChannel !== channel.name && unreadChannels.has(channel.name) && !mentionedChannels.has(channel.name) && (
                                                    <span className="unread-indicator"></span>
                                                )}
                                                {/* Delete Channel Button - Only for Admins */}
                                                {hasPermission(auth.currentUser, 'delete_channels') && (
                                                    <button 
                                                        className="delete-channel-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteChannel(channel.name);
                                                        }}
                                                        title="Delete Channel"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    
                    {/* Create Channel Button - Only for moderators/admins */}
                    {hasPermission(auth.currentUser, 'create_channels') && (
                        <div className="create-channel-section">
                            {!showCreateChannel ? (
                                <button 
                                    className="create-channel-btn"
                                    onClick={() => setShowCreateChannel(true)}
                                    title="Create Channel"
                                >
                                    <span className="channel-icon">+</span>
                                    <span>Create Channel</span>
                                </button>
                            ) : (
                                <div className="create-channel-form">
                                    <input
                                        type="text"
                                        value={newChannelName}
                                        onChange={(e) => setNewChannelName(e.target.value)}
                                        placeholder="Channel name (emojis allowed!)"
                                        className="channel-name-input"
                                        onKeyPress={(e) => e.key === 'Enter' && createChannel()}
                                        autoFocus
                                    />
                                    <select
                                        value={newChannelCategory}
                                        onChange={(e) => setNewChannelCategory(e.target.value)}
                                        className="channel-category-select"
                                    >
                                        {categories.map(category => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="create-channel-actions">
                                        <button 
                                            className="create-channel-confirm"
                                            onClick={createChannel}
                                        >
                                            Create
                                        </button>
                                        <button 
                                            className="create-channel-cancel"
                                            onClick={() => {
                                                setShowCreateChannel(false);
                                                setNewChannelName('');
                                                setNewChannelCategory('General');
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                {/* Create Category Section - Only for moderators/admins */}
                {hasPermission(auth.currentUser, 'create_channels') && (
                    <div className="create-category-section">
                        {!showCreateCategory ? (
                            <button 
                                className="create-category-btn"
                                onClick={() => setShowCreateCategory(true)}
                                title="Create Category"
                            >
                                <span className="category-icon">+</span>
                                <span>Create Category</span>
                            </button>
                        ) : (
                            <div className="create-category-form">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Category name"
                                    className="category-name-input"
                                    onKeyPress={(e) => e.key === 'Enter' && createCategory()}
                                    autoFocus
                                />
                                <div className="create-category-actions">
                                    <button 
                                        className="create-category-confirm"
                                        onClick={createCategory}
                                    >
                                        Create
                                    </button>
                                    <button 
                                        className="create-category-cancel"
                                        onClick={() => {
                                            setShowCreateCategory(false);
                                            setNewCategoryName('');
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="channel-sidebar-footer">
                    <UserProfileButton 
                    onClick={() => setShowProfileModal(true)}
                />
                    <SignOut />
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
                {selectedChannel ? (
                    <>
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
                    </>
                ) : (
                    <div className="no-channel-selected">
                        <div className="no-channel-selected-icon">💬</div>
                        <div className="no-channel-selected-title">Welcome to SuperChat!</div>
                        <div className="no-channel-selected-description">
                            Select a channel from the sidebar to start chatting, or create a new channel to get started.
                        </div>
                    </div>
                )}
            </div>

            {/* Members Sidebar */}
            <div className="members-sidebar">
                <div className="members-header">
                    <span>Online — {members.length}</span>
                </div>
                <div className="members-list">
                    {/* Admins Section */}
                    {members.filter(member => member.role === 'Admin').length > 0 && (
                        <div className="role-section">
                            <div className="role-section-header">
                                <span>Administrators — {members.filter(member => member.role === 'Admin').length}</span>
                            </div>
                            <div className="role-section-list">
                                {members.filter(member => member.role === 'Admin').map(member => {
                                    const role = { name: member.role, color: member.roleColor, icon: member.roleIcon };
                                    return (
                                        <div 
                                            key={member.uniqueKey || member.uid}
                                            className={`member-item ${role.name.toLowerCase()}`}
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
                                            <div className="member-info">
                                                <span 
                                                    className={`member-name ${member.isAnonymous ? 'guest' : ''}`}
                                                    style={{ color: role.color }}
                                                >
                                                    {member.displayName}
                                                </span>
                                                <span className="member-role" style={{ color: role.color }}>
                                                    {role.icon} {role.name}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Moderators Section */}
                    {members.filter(member => member.role === 'Moderator').length > 0 && (
                        <div className="role-section">
                            <div className="role-section-header">
                                <span>Moderators — {members.filter(member => member.role === 'Moderator').length}</span>
                            </div>
                            <div className="role-section-list">
                                {members.filter(member => member.role === 'Moderator').map(member => {
                                    const role = { name: member.role, color: member.roleColor, icon: member.roleIcon };
                                    return (
                                        <div 
                                            key={member.uniqueKey || member.uid}
                                            className={`member-item ${role.name.toLowerCase()}`}
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
                                            <div className="member-info">
                                                <span 
                                                    className={`member-name ${member.isAnonymous ? 'guest' : ''}`}
                                                    style={{ color: role.color }}
                                                >
                                                    {member.displayName}
                                                </span>
                                                <span className="member-role" style={{ color: role.color }}>
                                                    {role.icon} {role.name}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Members Section */}
                    {members.filter(member => member.role === 'User' || !member.role || member.role === 'undefined').length > 0 && (
                        <div className="role-section">
                            <div className="role-section-header">
                                <span>Members — {members.filter(member => member.role === 'User' || !member.role || member.role === 'undefined').length}</span>
                            </div>
                            <div className="role-section-list">
                                {members.filter(member => member.role === 'User' || !member.role || member.role === 'undefined').map(member => {
                                    // Ensure we have valid role data
                                    const role = { 
                                        name: member.role || 'User', 
                                        color: member.roleColor || '#8e9297', 
                                        icon: member.roleIcon || '👤' 
                                    };
                                    return (
                                        <div 
                                            key={member.uniqueKey || member.uid}
                                            className={`member-item ${role.name.toLowerCase()}`}
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
                                            <div className="member-info">
                                                <span 
                                                    className={`member-name ${member.isAnonymous ? 'guest' : ''}`}
                                                    style={{ color: role.color }}
                                                >
                                                    {member.displayName}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

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
    // React.useEffect(() => {
    //     if (messages && messages.length > 0) {
    //         console.log('🔍 Message IDs check:', messages.length, 'messages loaded');
    //     }
    // }, [messages]);
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
    // console.log('=== CHATROOM DEBUG ===', channel, messages?.length || 0, 'messages');

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

        const { uid, photoURL, isAnonymous } = auth.currentUser;
        
        // Get guest code if user is anonymous
        const guestCode = isAnonymous ? localStorage.getItem('guestCode') : null;
        
        // Get current username from Firestore users collection
        let currentDisplayName;
        try {
            const userDocId = isAnonymous ? `guest_${guestCode}` : uid;
            const userDoc = await firestore.collection('users').doc(userDocId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentDisplayName = userData.displayName || userData.username;
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
        
        // Fallback to auth displayName if not found in database
        if (!currentDisplayName) {
            currentDisplayName = auth.currentUser.displayName || 'Anonymous';
        }
        
        const displayNameWithCode = isAnonymous 
            ? `Guest ${guestCode || 'XXXX'}` 
            : currentDisplayName;
            
        console.log('User info:', { uid, photoURL, displayName: currentDisplayName, isAnonymous });

        const userRole = getUserRole(auth.currentUser);
        const messageData = {
            text: formValue,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            uid,
            photoURL,
            displayName: displayNameWithCode,
            channel: channel || 'general',
            guestCode: guestCode || null,
            role: userRole.name,
            roleLevel: userRole.level,
            roleColor: userRole.color,
            roleIcon: userRole.icon
        };

        console.log('Message data to send:', messageData);

        try {
            const docRef = await messagesRef.add(messageData);
            console.log('Message sent successfully with ID:', docRef.id);
            
            // Update user's last seen time
            await saveUserToFirestore(auth.currentUser, {
                displayName: currentDisplayName,
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

    // console.log('Filtered messages count:', filteredMessages.length);

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
    const { text, uid, photoURL, displayName, createdAt, guestCode, id, reactions, role, roleColor, roleIcon } = message;
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
                        style={{ color: roleColor || '#dcddde' }}
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
                        {roleIcon && role !== 'User' && `${roleIcon} `}
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
                
                {/* Edit/Delete buttons for own messages or moderators/admins */}
                {((uid === auth.currentUser?.uid) || hasPermission(auth.currentUser, 'delete_messages')) && !isEditing && (
                    <>
                        {uid === auth.currentUser?.uid && (
                            <button 
                                className="edit-message-btn"
                                onClick={() => setIsEditing(true)}
                                title="Edit Message"
                            >
                                ✏️
                            </button>
                        )}
                        <button 
                            className="delete-message-btn"
                            onClick={handleDeleteMessage}
                            title={uid === auth.currentUser?.uid ? "Delete Message" : "Delete Message (Moderator)"}
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
    const getUserProfile = async () => {
        if (!user) return;
        
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
                    profilePicture: (user.photoURL && user.photoURL !== '' ? user.photoURL : ''),
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

    React.useEffect(() => {
        getUserProfile();
    }, [user]);

    // Listen for profile updates
    React.useEffect(() => {
        const unsubscribe = addProfileUpdateListener(getUserProfile);
        return unsubscribe;
    }, []);
    
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
                        profilePicture: data.profilePicture || (user.photoURL && user.photoURL !== '' ? user.photoURL : ''),
                        banner: data.banner || ''
                    });
                } else {
                    // Set default values
                    setUserProfile({
                        username: user.displayName || (user.isAnonymous ? `Guest ${localStorage.getItem('guestCode') || 'XXXX'}` : ''),
                        aboutMe: '',
                        profilePicture: (user.photoURL && user.photoURL !== '' ? user.photoURL : ''),
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
        if (!file || !user) {
            console.log('No file or user:', { file: !!file, user: !!user });
            return;
        }
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
            return;
        }
        
        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            alert('Image file is too large. Please select a file smaller than 5MB.');
            return;
        }
        
        console.log('Starting upload:', { fileName: file.name, fileSize: file.size, fileType: file.type });
        setUploadingImage(true);
        
        try {
            const fileExtension = file.name.split('.').pop();
            const fileName = `${user.uid}_${type}_${Date.now()}.${fileExtension}`;
            
            console.log('Uploading to:', `profile-images/${fileName}`);
            
            // Try using the compat storage first (might work better with CORS)
            const storageRef = storage.ref().child(`profile-images/${fileName}`);
            
            // Upload the file using compat API
            const uploadTask = storageRef.put(file);
            
            // Wait for upload to complete
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        // Progress tracking
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log(`Upload is ${progress}% done`);
                    },
                    (error) => {
                        console.error('Upload error:', error);
                        reject(error);
                    },
                    async () => {
                        try {
                            const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                            console.log('Got download URL:', downloadURL);
                            
                            // Update the profile state
                            setUserProfile(prev => ({
                                ...prev,
                                [type]: downloadURL
                            }));
                            
                            setUploadingImage(false);
                            console.log('Image upload completed successfully');
                            resolve();
                        } catch (error) {
                            console.error('Error getting download URL:', error);
                            reject(error);
                        }
                    }
                );
            });
            
        } catch (error) {
            console.error('Error uploading image:', error);
            alert(`Error uploading image: ${error.message || 'Please try again.'}`);
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
            
            // Update user profile
            const profileRef = firestore.collection('userProfiles').doc(documentId);
            await profileRef.set({
                username: userProfile.username,
                aboutMe: userProfile.aboutMe,
                profilePicture: userProfile.profilePicture,
                banner: userProfile.banner,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Also update the main users collection for members list
            const usersRef = firestore.collection('users').doc(documentId);
            
            // For guest users, ensure we preserve the guestCode and handle photoURL properly
            const currentUserRole = getUserRole(user);
            const updateData = {
                displayName: userProfile.username,
                username: userProfile.username,
                profilePicture: userProfile.profilePicture,
                banner: userProfile.banner,
                role: currentUserRole.name,
                roleLevel: currentUserRole.level,
                roleColor: currentUserRole.color,
                roleIcon: currentUserRole.icon,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Only set photoURL if there's a custom profile picture
            if (userProfile.profilePicture && userProfile.profilePicture !== '') {
                updateData.photoURL = userProfile.profilePicture;
            }
            
            // For guest users, preserve the guestCode
            if (user.isAnonymous) {
                const guestCode = localStorage.getItem('guestCode');
                if (guestCode) {
                    updateData.guestCode = guestCode;
                    updateData.isAnonymous = true;
                }
            }
            
            await usersRef.set(updateData, { merge: true });
            
            // Update messages with new display name
            const messagesRef = firestore.collection('messages');
            const userMessagesQuery = messagesRef.where('uid', '==', user.uid);
            const userMessagesSnapshot = await userMessagesQuery.get();
            
            const batch = firestore.batch();
            const messageUserRole = getUserRole(user);
            userMessagesSnapshot.forEach(doc => {
                const messageRef = messagesRef.doc(doc.id);
                const messageUpdate = {
                    displayName: userProfile.username,
                    role: messageUserRole.name,
                    roleLevel: messageUserRole.level,
                    roleColor: messageUserRole.color,
                    roleIcon: messageUserRole.icon
                };
                
                // Only update photoURL if there's a custom profile picture
                if (userProfile.profilePicture && userProfile.profilePicture !== '') {
                    messageUpdate.photoURL = userProfile.profilePicture;
                }
                
                // For guest users, ensure guestCode is preserved
                if (user.isAnonymous) {
                    const guestCode = localStorage.getItem('guestCode');
                    if (guestCode) {
                        messageUpdate.guestCode = guestCode;
                    }
                }
                
                batch.update(messageRef, messageUpdate);
            });
            
            await batch.commit();
            
            // Trigger profile update event to refresh UI
            triggerProfileUpdate();
            
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
                
                {/* Role Management Section - Only for Admins */}
                {hasPermission(user, 'manage_roles') && (
                    <div className="role-management-section">
                        <h3>Role Management</h3>
                        <div className="role-info">
                            <p><strong>Current Role:</strong> <span style={{ color: getUserRole(user).color }}>{getUserRole(user).icon} {getUserRole(user).name}</span></p>
                            <p className="role-description">
                                {getUserRole(user).name === 'Admin' 
                                    ? 'You have full permissions including role management, channel creation, and message moderation.'
                                    : getUserRole(user).name === 'Moderator'
                                    ? 'You can create channels and moderate messages.'
                                    : 'You are a regular user with basic permissions.'
                                }
                            </p>
                        </div>
                        <div className="role-permissions">
                            <h4>Your Permissions:</h4>
                            <ul>
                                <li className={hasPermission(user, 'delete_messages') ? 'enabled' : 'disabled'}>
                                    {hasPermission(user, 'delete_messages') ? '✅' : '❌'} Delete Messages
                                </li>
                                <li className={hasPermission(user, 'create_channels') ? 'enabled' : 'disabled'}>
                                    {hasPermission(user, 'create_channels') ? '✅' : '❌'} Create Channels
                                </li>
                                <li className={hasPermission(user, 'manage_roles') ? 'enabled' : 'disabled'}>
                                    {hasPermission(user, 'manage_roles') ? '✅' : '❌'} Manage Roles
                                </li>
                                <li className={hasPermission(user, 'delete_channels') ? 'enabled' : 'disabled'}>
                                    {hasPermission(user, 'delete_channels') ? '✅' : '❌'} Delete Channels
                                </li>
                            </ul>
                        </div>
                        <div className="role-note">
                            <p><em>Note: Roles are managed by administrators through the code. Contact an admin to change your role.</em></p>
                        </div>
                    </div>
                )}
                
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