import React, { useRef, useState } from 'react';
import './App.css';

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
// Firebase Storage removed - using base64 encoding instead

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
// Firebase Storage removed - using base64 encoding instead

// Simple event system for profile updates
const profileUpdateListeners = new Set();

const addProfileUpdateListener = (callback) => {
    profileUpdateListeners.add(callback);
    return () => profileUpdateListeners.delete(callback);
};

const triggerProfileUpdate = () => {
    profileUpdateListeners.forEach(callback => callback());
};

// Global compress image function with performance optimizations
const compressImage = (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve, reject) => {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            reject(new Error('File is not an image'));
            return;
        }
        
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            reject(new Error('File is too large (max 10MB)'));
            return;
        }
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            try {
                // Calculate new dimensions with better aspect ratio handling
                let { width, height } = img;
                const aspectRatio = width / height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        width = maxWidth;
                        height = width / aspectRatio;
                    }
                } else {
                    if (height > maxHeight) {
                        height = maxHeight;
                        width = height * aspectRatio;
                    }
                }
                
                // Ensure minimum dimensions
                width = Math.max(width, 32);
                height = Math.max(height, 32);
                
                canvas.width = width;
                canvas.height = height;
                
                // Use better image rendering
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                
                // Clean up
                URL.revokeObjectURL(img.src);
                
                resolve(compressedDataUrl);
            } catch (error) {
                reject(error);
            }
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };
        
        img.src = URL.createObjectURL(file);
    });
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
        const profileRef = firestore.collection('userProfiles').doc(documentId);
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
        
        // Save to both collections for compatibility
        await userRef.set(userData, { merge: true });
        await profileRef.set(userData, { merge: true });
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
    const [selectedServer, setSelectedServer] = useState(null);
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
    
    // Server-related state
    const [servers, setServers] = useState([]);
    const [showCreateServer, setShowCreateServer] = useState(false);
    const [newServerName, setNewServerName] = useState('');
    const [newServerDescription, setNewServerDescription] = useState('');
    const [showServerContextMenu, setShowServerContextMenu] = useState(null);
    const [selectedServerId, setSelectedServerId] = useState(null);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [showChannelContextMenu, setShowChannelContextMenu] = useState(false);
    const [selectedChannelName, setSelectedChannelName] = useState(null);
    const [channelContextPosition, setChannelContextPosition] = useState({ x: 0, y: 0 });
    const [draggedChannel, setDraggedChannel] = useState(null);
    const [editingChannel, setEditingChannel] = useState(null);
    const [editingChannelName, setEditingChannelName] = useState('');
    const [showServerIconModal, setShowServerIconModal] = useState(false);
    const [newServerIcon, setNewServerIcon] = useState('');
    
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

    // Create the initial SuperChat server if it doesn't exist
    const createInitialServer = async () => {
        try {
            const serversRef = firestore.collection('servers');
            const superChatQuery = serversRef.where('name', '==', 'SuperChat Server');
            const superChatSnapshot = await superChatQuery.get();
            
            if (superChatSnapshot.empty) {
                // Create the initial SuperChat server
                const serverData = {
                    name: 'SuperChat Server',
                    description: 'The main SuperChat server where everyone can chat',
                    ownerId: 'system',
                    members: [], // Will be populated as users join
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                const serverRef = await serversRef.add(serverData);
                
                // Create default channels for SuperChat server
                const defaultChannels = [
                    { name: 'general', category: 'General' },
                    { name: 'random', category: 'General' }
                ];
                
                const channelsData = {
                    channels: defaultChannels,
                    categories: ['General', 'Gaming', 'Music', 'Art'],
                    serverId: serverRef.id,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await firestore.collection('channels').doc(serverRef.id).set(channelsData);
                
                console.log('Initial SuperChat server created:', serverRef.id);
            }
        } catch (error) {
            console.error('Error creating initial server:', error);
        }
    };

    // Load servers from Firestore
    const loadServers = async () => {
        try {
            const serversRef = firestore.collection('servers');
            const serversSnapshot = await serversRef.get();
            
            const serversData = [];
            serversSnapshot.forEach(doc => {
                serversData.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            // Sort servers by creation date (newest first)
            serversData.sort((a, b) => b.createdAt?.toDate() - a.createdAt?.toDate());
            
            setServers(serversData);
            
            // If no server is selected and we have servers, select the first one
            if (!selectedServer && serversData.length > 0) {
                setSelectedServer(serversData[0]);
            }
        } catch (error) {
            console.error('Error loading servers:', error);
        }
    };

    // Load channels from Firestore for the selected server
    const loadChannels = async () => {
        if (!selectedServer) {
            setChannels([]);
            setChannelsLoaded(true);
            return;
        }
        
        try {
            const channelsRef = firestore.collection('channels').doc(selectedServer.id);
            const channelsDoc = await channelsRef.get();
            
            if (channelsDoc.exists) {
                const channelsData = channelsDoc.data();
                setChannels(channelsData.channels || []);
                setCategories(channelsData.categories || ['General', 'Gaming', 'Music', 'Art']);
            } else {
                // Create empty channels document for this server
                const defaultCategories = ['General', 'Gaming', 'Music', 'Art'];
                await channelsRef.set({
                    channels: [],
                    categories: defaultCategories,
                    serverId: selectedServer.id,
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

    // Create a new server
    const createServer = async () => {
        if (!newServerName.trim()) {
            alert('Please enter a server name');
            return;
        }

        try {
            const serverData = {
                name: newServerName.trim(),
                description: newServerDescription.trim(),
                ownerId: auth.currentUser?.uid || 'anonymous',
                members: [auth.currentUser?.uid || 'anonymous'], // Auto-add creator
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const serverRef = await firestore.collection('servers').add(serverData);
            
            // Create default channels for the new server
            const defaultChannels = [
                { name: 'general', category: 'General' },
                { name: 'random', category: 'General' }
            ];
            
            const channelsData = {
                channels: defaultChannels,
                categories: ['General', 'Gaming', 'Music', 'Art'],
                serverId: serverRef.id,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await firestore.collection('channels').doc(serverRef.id).set(channelsData);
            
            // Reset form
            setNewServerName('');
            setNewServerDescription('');
            setShowCreateServer(false);
            
            // Reload servers
            await loadServers();
            
            console.log('Server created successfully:', serverRef.id);
        } catch (error) {
            console.error('Error creating server:', error);
            alert('Error creating server. Please try again.');
        }
    };

    // Delete a server
    const deleteServer = async (serverId) => {
        if (!window.confirm('Are you sure you want to delete this server? This action cannot be undone.')) {
            return;
        }

        try {
            // Delete server
            await firestore.collection('servers').doc(serverId).delete();
            
            // Delete server channels
            await firestore.collection('channels').doc(serverId).delete();
            
            // Delete all messages in this server
            const messagesRef = firestore.collection('messages');
            const serverMessagesQuery = messagesRef.where('serverId', '==', serverId);
            const serverMessagesSnapshot = await serverMessagesQuery.get();
            
            const batch = firestore.batch();
            serverMessagesSnapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            
            // If this was the selected server, switch to another one
            if (selectedServer?.id === serverId) {
                const remainingServers = servers.filter(s => s.id !== serverId);
                if (remainingServers.length > 0) {
                    setSelectedServer(remainingServers[0]);
                } else {
                    setSelectedServer(null);
                }
            }
            
            // Reload servers
            await loadServers();
            
            console.log('Server deleted successfully:', serverId);
        } catch (error) {
            console.error('Error deleting server:', error);
            alert('Error deleting server. Please try again.');
        }
    };

    // Handle channel drag start
    const handleChannelDragStart = (e, channel) => {
        setDraggedChannel(channel);
        e.dataTransfer.effectAllowed = 'move';
    };

    // Handle channel drag over
    const handleChannelDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    // Handle channel drop
    const handleChannelDrop = async (e, targetCategory) => {
        e.preventDefault();
        
        if (!draggedChannel || !selectedServer) return;
        
        // Don't move if it's already in the same category
        if (draggedChannel.category === targetCategory) {
            setDraggedChannel(null);
            return;
        }
        
        try {
            // Update channel category
            const updatedChannels = channels.map(channel => 
                channel.name === draggedChannel.name 
                    ? { ...channel, category: targetCategory }
                    : channel
            );
            
            setChannels(updatedChannels);
            await saveChannels(updatedChannels);
            
            console.log(`Moved channel ${draggedChannel.name} to ${targetCategory}`);
        } catch (error) {
            console.error('Error moving channel:', error);
            alert('Error moving channel. Please try again.');
        } finally {
            setDraggedChannel(null);
        }
    };

    // Handle channel rename
    const handleChannelRename = async (channelName, newName) => {
        if (!newName.trim() || newName.trim() === channelName) {
            setEditingChannel(null);
            setEditingChannelName('');
            return;
        }
        
        try {
            // Update channel name
            const updatedChannels = channels.map(channel => 
                channel.name === channelName 
                    ? { ...channel, name: newName.trim() }
                    : channel
            );
            
            setChannels(updatedChannels);
            await saveChannels(updatedChannels);
            
            // If this was the selected channel, update it
            if (selectedChannel === channelName) {
                setSelectedChannel(newName.trim());
            }
            
            setEditingChannel(null);
            setEditingChannelName('');
            
            console.log(`Renamed channel ${channelName} to ${newName.trim()}`);
        } catch (error) {
            console.error('Error renaming channel:', error);
            alert('Error renaming channel. Please try again.');
        }
    };

    // Handle channel deletion
    const deleteChannel = async (channelName) => {
        if (!hasPermission(auth.currentUser, 'delete_channels')) {
            alert('You do not have permission to delete channels.');
            return;
        }

        if (!window.confirm(`Are you sure you want to delete the channel "#${channelName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            // Remove channel from channels array
            const updatedChannels = channels.filter(channel => channel.name !== channelName);
            setChannels(updatedChannels);
            await saveChannels(updatedChannels);
            
            // If this was the selected channel, switch to general
            if (selectedChannel === channelName) {
                setSelectedChannel('general');
            }
            
            console.log(`Deleted channel: ${channelName}`);
        } catch (error) {
            console.error('Error deleting channel:', error);
            alert('Error deleting channel. Please try again.');
        }
    };

    // Handle channel context menu actions
    const handleChannelContextAction = (action) => {
        if (!selectedChannelName) return;
        
        setShowChannelContextMenu(false);
        
        if (action === 'rename') {
            setEditingChannel(selectedChannelName);
            setEditingChannelName(selectedChannelName);
        } else if (action === 'delete') {
            deleteChannel(selectedChannelName);
        }
    };


    // Handle server icon change
    const handleServerIconChange = async (serverId, newIcon) => {
        if (!newIcon.trim()) {
            alert('Please enter an icon');
            return;
        }
        
        try {
            await firestore.collection('servers').doc(serverId).update({
                icon: newIcon.trim(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update local state
            setServers(prev => prev.map(server => 
                server.id === serverId 
                    ? { ...server, icon: newIcon.trim() }
                    : server
            ));
            
            setNewServerIcon('');
            setShowServerIconModal(false);
            
            console.log(`Updated server icon to ${newIcon.trim()}`);
        } catch (error) {
            console.error('Error updating server icon:', error);
            alert('Error updating server icon. Please try again.');
        }
    };

    // Save channels to Firestore
    const saveChannels = async (newChannels, newCategories = null) => {
        if (!selectedServer) return;
        
        try {
            const channelsRef = firestore.collection('channels').doc(selectedServer.id);
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
    const indicatorQuery = selectedServer 
        ? messagesRef.where('serverId', '==', selectedServer.id).orderBy('createdAt', 'desc').limit(100)
        : messagesRef.orderBy('createdAt', 'desc').limit(100);
    const [indicatorSnapshot] = useCollection(indicatorQuery);
    
    const indicatorMessages = React.useMemo(() => {
        return indicatorSnapshot?.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) || [];
    }, [indicatorSnapshot]);
    
    // Mark channel as read when switching to it
    React.useEffect(() => {
        if (selectedChannel) {
        setReadChannels(prev => {
            const newSet = new Set(prev);
            newSet.add(selectedChannel);
            return newSet;
        });
            
            // Immediately clear unread and mention indicators for this channel
            setUnreadChannels(prev => {
                const newSet = new Set(prev);
                newSet.delete(selectedChannel);
                return newSet;
            });
            
            setMentionedChannels(prev => {
                const newSet = new Set(prev);
                newSet.delete(selectedChannel);
                return newSet;
            });
        }
    }, [selectedChannel]);

    // Track when each channel was last visited to determine if there are new messages
    const channelLastVisitedRef = useRef(new Map());
    
    // Update last visited time when switching channels
    React.useEffect(() => {
        if (selectedChannel) {
            channelLastVisitedRef.current.set(selectedChannel, Date.now());
        }
    }, [selectedChannel]);

    // Check for mentions and unread messages
    React.useEffect(() => {
        if (!indicatorMessages || !auth.currentUser || indicatorMessages.length === 0) return;
        
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
            
            // Skip if message is from current user
            if (msg.uid === currentUserId) return;
            
            // Check if this message is newer than when the channel was last visited
            const lastVisited = channelLastVisitedRef.current.get(channel);
            const isNewMessage = !lastVisited || messageTime.getTime() > lastVisited;
            
            if (isNewMessage) {
                // This is a new message since last visit
                newUnreadChannels.add(channel);
                
                // Check for mentions
                if (msg.text && msg.text.includes('@')) {
                    // Note: We can't use async/await in forEach, so we'll check mentions in the ChatRoom component instead
                    // This is a simplified check for now
                    const displayName = currentUser.isAnonymous 
                        ? `Guest ${localStorage.getItem('guestCode') || 'XXXX'}`
                        : currentUser.displayName || 'Anonymous';
                    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const mentionPattern = new RegExp(`@${escapedName}(?!\\S)`, 'i');
                    const isMentioned = mentionPattern.test(msg.text);
                    
                if (isMentioned) {
                    newMentionedChannels.add(channel);
                    }
                }
            }
        });
        
        // Only update state if there are actual changes
        setUnreadChannels(prev => {
            const prevArray = Array.from(prev);
            const newArray = Array.from(newUnreadChannels);
            if (prevArray.length !== newArray.length || !prevArray.every(item => newArray.includes(item))) {
                return newUnreadChannels;
            }
            return prev;
        });
        
        setMentionedChannels(prev => {
            const prevArray = Array.from(prev);
            const newArray = Array.from(newMentionedChannels);
            if (prevArray.length !== newArray.length || !prevArray.every(item => newArray.includes(item))) {
                return newMentionedChannels;
            }
            return prev;
        });
    }, [indicatorMessages, auth.currentUser]);

    // Load all users from Firestore users collection
    const loadAllUsers = React.useCallback(async (skipUpdates = false) => {
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
            
            // console.log('Loaded users:', allUsers.length, 'users');
            // console.log('Users by role:', {
            //     admins: allUsers.filter(u => u.role === 'Admin').length,
            //     moderators: allUsers.filter(u => u.role === 'Moderator').length,
            //     users: allUsers.filter(u => u.role === 'User').length,
            //     undefined: allUsers.filter(u => !u.role || u.role === 'undefined').length
            // });
            setMembers(allUsers);
            
            // Only update users who don't have role information if not skipping updates
            if (!skipUpdates) {
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
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }, []);

    React.useEffect(() => {
        loadAllUsers();
        createInitialServer().then(() => {
            loadServers();
        });
    }, []); // Empty dependency array - only run once

    // Load channels when selected server changes
    React.useEffect(() => {
        if (selectedServer) {
            loadChannels();
        }
    }, [selectedServer]);

    // Listen for profile updates
    React.useEffect(() => {
        const unsubscribe = addProfileUpdateListener(() => loadAllUsers(true));
        return unsubscribe;
    }, [loadAllUsers]);

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
        if (!indicatorMessages || indicatorMessages.length === 0) return;
        
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
            let hasChanges = false;
            
            // Add new members that aren't already in the list
            newMembers.forEach(member => {
                const key = member.uniqueKey || member.uid;
                if (!existingMap.has(key)) {
                    existingMap.set(key, member);
                    hasChanges = true;
                }
            });
            
            return hasChanges ? Array.from(existingMap.values()) : prev;
        });
    }, [indicatorMessages]);
    
    return (
        <>
            {/* Server Sidebar */}
            <div className="server-sidebar">
                {servers.map((server) => (
                    <div 
                        key={server.id}
                        className={`server-icon ${selectedServer?.id === server.id ? 'active' : ''}`}
                        onClick={() => setSelectedServer(server)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenuPosition({ x: e.clientX, y: e.clientY });
                            setSelectedServerId(server.id);
                            setShowServerContextMenu(true);
                        }}
                        title={server.name}
                    >
                        {server.icon ? (
                            server.icon.startsWith('data:image') ? (
                                <img 
                                    src={server.icon} 
                                    alt={server.name}
                                    className="server-icon-image"
                                />
                            ) : (
                                server.icon
                            )
                        ) : (
                            server.name.charAt(0).toUpperCase()
                        )}
                    </div>
                ))}
                <div 
                    className="server-icon add-server"
                    onClick={() => setShowCreateServer(true)}
                    title="Add Server"
                >
                    +
                </div>
            </div>

            {/* Server Context Menu */}
            {showServerContextMenu && (
                <div 
                    className="context-menu"
                    style={{
                        position: 'fixed',
                        left: contextMenuPosition.x,
                        top: contextMenuPosition.y,
                        zIndex: 1000
                    }}
                    onMouseLeave={() => setShowServerContextMenu(false)}
                >
                    <div className="context-menu-item" onClick={() => {
                        setShowServerContextMenu(false);
                        setShowServerIconModal(true);
                    }}>
                        Change Icon
                    </div>
                    <div className="context-menu-item danger" onClick={() => {
                        setShowServerContextMenu(false);
                        deleteServer(selectedServerId);
                    }}>
                        Delete Server
                    </div>
                </div>
            )}

            {/* Channel Context Menu */}
            {showChannelContextMenu && (
                <div 
                    className="context-menu"
                    style={{
                        position: 'fixed',
                        left: channelContextPosition.x,
                        top: channelContextPosition.y,
                        zIndex: 1000
                    }}
                    onMouseLeave={() => setShowChannelContextMenu(false)}
                >
                    <div className="context-menu-item" onClick={() => handleChannelContextAction('rename')}>
                        Rename Channel
                    </div>
                    {hasPermission(auth.currentUser, 'delete_channels') && (
                        <div className="context-menu-item danger" onClick={() => handleChannelContextAction('delete')}>
                            Delete Channel
                        </div>
                    )}
                </div>
            )}

            {/* Channel Sidebar */}
            <div className="channel-sidebar">
                <div className="server-header">
                    <div className="server-header-left">
                        <img 
                            className="server-header-logo" 
                            src="/SuperChat.png" 
                            alt="Server Logo"
                        />
                        <span>{selectedServer?.name || 'Select a Server'}</span>
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
                        <div 
                            className="channel-list"
                            onDragOver={handleChannelDragOver}
                            onDrop={(e) => handleChannelDrop(e, category)}
                        >
                                        {categoryChannels.map(channel => (
                            <div 
                                                key={channel.name}
                                                className={`channel ${selectedChannel === channel.name ? 'active' : ''} ${selectedChannel !== channel.name && unreadChannels.has(channel.name) ? 'unread' : ''} ${selectedChannel !== channel.name && mentionedChannels.has(channel.name) ? 'mentioned' : ''} ${draggedChannel?.name === channel.name ? 'dragging' : ''}`}
                                                onClick={() => setSelectedChannel(channel.name)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setChannelContextPosition({ x: e.clientX, y: e.clientY });
                                                    setSelectedChannelName(channel.name);
                                                    setShowChannelContextMenu(true);
                                                }}
                                                draggable
                                                onDragStart={(e) => handleChannelDragStart(e, channel)}
                                                onDoubleClick={() => {
                                                    setEditingChannel(channel.name);
                                                    setEditingChannelName(channel.name);
                                                }}
                            >
                                <span className="channel-icon">#</span>
                                                {editingChannel === channel.name ? (
                                                    <input
                                                        type="text"
                                                        value={editingChannelName}
                                                        onChange={(e) => setEditingChannelName(e.target.value)}
                                                        onBlur={() => handleChannelRename(channel.name, editingChannelName)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                handleChannelRename(channel.name, editingChannelName);
                                                            } else if (e.key === 'Escape') {
                                                                setEditingChannel(null);
                                                                setEditingChannelName('');
                                                            }
                                                        }}
                                                        className="channel-rename-input"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span className="channel-name">{channel.name}</span>
                                                )}
                                                {selectedChannel !== channel.name && mentionedChannels.has(channel.name) && (
                                    <span className="mention-indicator">@</span>
                                )}
                                                {selectedChannel !== channel.name && unreadChannels.has(channel.name) && !mentionedChannels.has(channel.name) && (
                                    <span className="unread-indicator"></span>
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
                            key={`${selectedServer?.id}-${selectedChannel}`}
                            channel={selectedChannel}
                            selectedServer={selectedServer}
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

            {/* Create Server Modal */}
            {showCreateServer && (
                <CreateServerModal 
                    onClose={() => setShowCreateServer(false)}
                    onCreateServer={createServer}
                    serverName={newServerName}
                    setServerName={setNewServerName}
                    serverDescription={newServerDescription}
                    setServerDescription={setNewServerDescription}
                />
            )}

            {/* Server Icon Change Modal */}
            {showServerIconModal && (
                <ServerIconModal 
                    onClose={() => setShowServerIconModal(false)}
                    onIconChange={(icon) => handleServerIconChange(selectedServerId, icon)}
                    serverIcon={newServerIcon}
                    setServerIcon={setNewServerIcon}
                />
            )}
        </>
    );
}

function ChatRoom({ channel, selectedServer, onUserClick }) {
    console.log('🔄 ChatRoom RENDERED - Channel:', channel, 'Server:', selectedServer?.name);
    
    const dummy = useRef();
    const messagesContainerRef = useRef();
    const lastMessageCountRef = useRef(0);
    const [messagesReady, setMessagesReady] = useState(false);
    const [stableMessages, setStableMessages] = useState([]);
    
    // Create a stable query that doesn't change unless server actually changes
    const query = React.useMemo(() => {
    const messagesRef = firestore.collection('messages');
        console.log('🔍 CREATING QUERY - Server:', selectedServer?.name, 'ServerId:', selectedServer?.id);
        
        if (selectedServer?.id) {
            // Query by serverId only, then sort in JavaScript to avoid index requirement
            return messagesRef.where('serverId', '==', selectedServer.id).limit(50);
        } else {
            return messagesRef.orderBy('createdAt', 'desc').limit(30);
        }
    }, [selectedServer?.id]); // Only depend on server ID, not the entire server object

    console.log('🔍 FIRESTORE QUERY - Server:', selectedServer?.name, 'ServerId:', selectedServer?.id);

    const [messagesSnapshot, loading, error] = useCollection(query);
    
    // Track component lifecycle
    React.useEffect(() => {
        console.log('🔄 ChatRoom MOUNTED - Channel:', channel, 'Server:', selectedServer?.name);
        return () => {
            console.log('🔄 ChatRoom UNMOUNTED - Channel:', channel, 'Server:', selectedServer?.name);
        };
    }, [channel, selectedServer?.name]);
    
    console.log('🔍 FIRESTORE RESULT - Loading:', loading, 'Error:', error);
    console.log('🔍 FIRESTORE RESULT - Snapshot docs:', messagesSnapshot?.docs?.length || 0);
    
    // Convert snapshot to data with IDs and sort by createdAt
    const messages = React.useMemo(() => {
        if (!messagesSnapshot?.docs) return [];
        
        const mappedMessages = messagesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Sort by createdAt ascending (oldest first, newest last)
        const sorted = mappedMessages.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.() || new Date(0);
            const bTime = b.createdAt?.toDate?.() || new Date(0);
            const timeDiff = aTime.getTime() - bTime.getTime();
            
            // Debug: Log individual timestamps
            console.log('🕐 SORTING:', {
                a: { id: a.id, time: aTime.toISOString(), timestamp: aTime.getTime() },
                b: { id: b.id, time: bTime.toISOString(), timestamp: bTime.getTime() },
                diff: timeDiff
            });
            
            return timeDiff;
        });
        
        // Debug: Log the sorted order with timestamps
        console.log('📝 SORTED MESSAGES:', sorted.map(m => ({ 
            id: m.id, 
            text: m.text?.substring(0, 20), 
            time: m.createdAt?.toDate?.()?.toISOString(),
            timestamp: m.createdAt?.toDate?.()?.getTime()
        })));
        
        return sorted;
    }, [messagesSnapshot]);
    
    // Debug: Log messages with comprehensive debugging
    console.log('🔍 CHATROOM DEBUG - Channel:', channel, 'Server:', selectedServer?.name, 'Messages:', messages.length);
    
    // Update stable messages only when there's a real change
    React.useEffect(() => {
        if (messages.length !== lastMessageCountRef.current) {
            console.log('📊 MESSAGE COUNT CHANGED:', lastMessageCountRef.current, '->', messages.length);
            lastMessageCountRef.current = messages.length;
            
            // Update stable messages immediately
            console.log('🔄 UPDATING STABLE MESSAGES:', messages.map(m => ({ 
                id: m.id, 
                text: m.text?.substring(0, 20), 
                time: m.createdAt?.toDate?.()?.toISOString()
            })));
            setStableMessages([...messages]);
            setMessagesReady(true);
        }
    }, [messages]);
    
    if (messages.length > 0) {
        console.log('📝 Message order check:', messages.map(m => ({ 
            id: m.id, 
            text: m.text?.substring(0, 20), 
            time: m.createdAt?.toDate?.()?.toISOString(),
            timestamp: m.createdAt?.toDate?.()?.getTime()
        })));
    }
    if (messages.length === 0) {
        console.log('❌ NO MESSAGES FOUND - This is the problem!');
    }
    
    const [formValue, setFormValue] = useState('');
    const messagesRef = firestore.collection('messages');

    // Mention system state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPosition, setMentionPosition] = useState(0);
    const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

    // Get unique users from messages for mention autocomplete
    const getUniqueUsers = React.useCallback(() => {
        if (!messages) return [];
        const userMap = new Map();
        messages.forEach(msg => {
            if (msg.displayName && msg.uid) {
                // Create unique key for guest users using guest code
                const uniqueKey = msg.guestCode ? `guest_${msg.guestCode}` : msg.uid;
                
                userMap.set(uniqueKey, {
                    displayName: msg.displayName,
                    uid: msg.uid,
                    uniqueKey: uniqueKey,
                    photoURL: msg.photoURL,
                    guestCode: msg.guestCode,
                    isAnonymous: msg.guestCode ? true : false
                });
            }
        });
        return Array.from(userMap.values());
    }, [messages]);

    const uniqueUsers = getUniqueUsers();

    // Function to get the correct avatar for mention dropdown users
    const getMentionAvatar = React.useCallback((user) => {
        // First check if user has a photoURL
        if (user.photoURL && user.photoURL !== '') {
            return user.photoURL;
        }
        
        // For guest users, generate avatar based on guest code
        if (user.isAnonymous && user.guestCode) {
            return `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.guestCode}&backgroundColor=5865f2&textColor=ffffff`;
        }
        
        // Default avatar
        return 'https://api.adorable.io/avatars/23/abott@adorable.png';
    }, []);

    // Filter users based on mention query
    const filteredUsers = React.useMemo(() => {
        if (!mentionQuery.trim()) return uniqueUsers;
        return uniqueUsers.filter(user => 
        user.displayName.toLowerCase().includes(mentionQuery.toLowerCase())
    );
    }, [uniqueUsers, mentionQuery]);

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
            // Use requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                if (dummy.current && isAtBottom()) {
                    dummy.current.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    }, [messages, isUserScrolling]);

    // Auto-scroll to bottom when channel changes
    React.useEffect(() => {
        if (messages && messages.length > 0) {
            requestAnimationFrame(() => {
                if (dummy.current) {
                    dummy.current.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    }, [channel]);

    // Handle scroll events to detect user scrolling with throttling
    const handleScroll = React.useCallback(() => {
        if (messagesContainerRef.current) {
            const atBottom = isAtBottom();
            setIsUserScrolling(!atBottom);
            setShowScrollToBottom(!atBottom);
        }
    }, []);

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
            isUserMentioned(latestMessage.text, currentUser).then(isMentioned => {
            if (isMentioned) {
                console.log('🔔 New mention detected! Playing sound immediately.');
                playMentionSound();
            }
            }).catch(error => {
                console.error('Error checking mention:', error);
            });
        }
    }, [messages, lastMessageId]);

    // Debug logging for messages (reduced)
    // console.log('=== CHATROOM DEBUG ===', channel, messages?.length || 0, 'messages');

    // Handle input change for mention detection
    const handleInputChange = (e) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;
        
        // Check for @ mention (updated to handle spaces)
        const textBeforeCursor = value.substring(0, cursorPosition);
        const mentionMatch = textBeforeCursor.match(/@([^\s]*(?:\s+[^\s]*)*)$/);
        
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

    const sendMessage = React.useCallback(async (e) => {
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
        
        // For guest users, use custom username if available, otherwise fall back to Guest XXXX format
        const displayNameWithCode = isAnonymous 
            ? (currentDisplayName || `Guest ${guestCode || 'XXXX'}`)
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
            serverId: selectedServer?.id || null,
            guestCode: guestCode || null,
            role: userRole.name,
            roleLevel: userRole.level,
            roleColor: userRole.color,
            roleIcon: userRole.icon
        };

        console.log('📤 SENDING MESSAGE - Data:', messageData);
        console.log('📤 SENDING MESSAGE - ServerId:', selectedServer?.id, 'Channel:', channel);

        try {
            const docRef = await messagesRef.add(messageData);
            console.log('✅ MESSAGE SENT SUCCESSFULLY - ID:', docRef.id);
            console.log('✅ MESSAGE SENT SUCCESSFULLY - Data:', messageData);
            
            // Update user's last seen time
            await saveUserToFirestore(auth.currentUser, {
                displayName: currentDisplayName,
                photoURL: photoURL,
                guestCode: guestCode
            });
        } catch (error) {
            console.error('❌ Error sending message:', error);
        }

        setFormValue('');
        setShowMentionDropdown(false);
        dummy.current.scrollIntoView({ behavior: 'smooth' });
    }, [formValue, channel, selectedServer, auth.currentUser, messagesRef]);

    // Filter messages for the current channel using stable messages
    const filteredMessages = React.useMemo(() => {
        if (!stableMessages || stableMessages.length === 0) return [];
        
        const filtered = stableMessages
        .filter(msg => {
            // If message has channel property, filter by it
            if (msg.channel) {
                return msg.channel === channel;
            }
            // If message doesn't have channel property (old messages), show in general
            return channel === 'general';
        });
        
        console.log('🔍 FILTERED MESSAGES - Channel:', channel, 'Count:', filtered.length);
        if (filtered.length > 0) {
            console.log('✅ Filtered message IDs:', filtered.map(m => m.id));
        } else {
            console.log('❌ NO FILTERED MESSAGES - Check channel filtering logic!');
        }
        
        return filtered;
    }, [stableMessages, channel]);

    // console.log('Filtered messages count:', filteredMessages.length);

    // Debug: Log what we're about to render
    console.log('🎨 RENDERING - About to render', filteredMessages.length, 'messages');

    // Simple message list rendering
    const messageList = React.useMemo(() => {
        if (filteredMessages.length === 0) {
            return (
                <div style={{color: '#8e9297', padding: '20px', textAlign: 'center'}}>
                    <p>No messages in #{channel} yet</p>
                    <p>Be the first to send a message!</p>
                </div>
            );
        }
        
        return filteredMessages.map(msg => <ChatMessage key={msg.id} message={msg} onUserClick={onUserClick} />);
    }, [filteredMessages, channel, onUserClick]);

    return (
        <>
            <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
                {messageList}
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
                                            src={getMentionAvatar(user)} 
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
const isUserMentioned = async (messageText, currentUser) => {
    if (!currentUser || !messageText) return false;
    
    // Quick check: if message doesn't contain @, no mention possible
    if (!messageText.includes('@')) return false;
    
    // Get the current user's display name (handle both regular and guest users)
    let displayName;
    if (currentUser.isAnonymous) {
        const guestCode = localStorage.getItem('guestCode');
        // Get custom username from database for guest users
        try {
            const userDocId = `guest_${guestCode}`;
            const userDoc = await firestore.collection('users').doc(userDocId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                displayName = userData.displayName || userData.username;
            }
        } catch (error) {
            console.error('Error fetching guest user data for mention:', error);
        }
        
        // Fallback to Guest format if no custom username found
        if (!displayName) {
        displayName = `Guest ${guestCode || 'XXXX'}`;
        }
    } else {
        displayName = currentUser.displayName || 'Anonymous';
    }
    
    // Create a regex pattern that matches @displayName (with or without spaces)
    const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Updated regex to handle usernames with spaces: @displayName(?!\S)
    const mentionPattern = new RegExp(`@${escapedName}(?!\\S)`, 'i');
    
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

const ChatMessage = React.memo(({ message, onUserClick }) => {
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
        // Updated regex to match @username with spaces: @[^\s]+(?:\s+[^\s]+)*
        const parts = text.split(/(@[^\s]+(?:\s+[^\s]+)*)/g);
        
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
});

function UserProfileButton({ onClick }) {
    const [user] = useAuthState(auth);
    const [userProfile, setUserProfile] = useState(null);
    
    // Get user profile data
    const getUserProfile = React.useCallback(async () => {
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
            
            // Try userProfiles first, then fallback to users
            let profileRef = firestore.collection('userProfiles').doc(documentId);
            let profileDoc = await profileRef.get();
            
            if (!profileDoc.exists) {
                // Fallback to users collection
                profileRef = firestore.collection('users').doc(documentId);
                profileDoc = await profileRef.get();
            }
            
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
    }, [user]);

    React.useEffect(() => {
        getUserProfile();
    }, [user, getUserProfile]);

    // Listen for profile updates
    React.useEffect(() => {
        const unsubscribe = addProfileUpdateListener(getUserProfile);
        return unsubscribe;
    }, [getUserProfile]);
    
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
    
    // Compress image to reduce file size
    const compressImage = (file, maxWidth = 800, quality = 0.7) => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            
            img.src = URL.createObjectURL(file);
        });
    };

    // Handle image upload (base64 encoding with compression)
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
        
        // Validate file size (max 5MB before compression)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            alert('Image file is too large. Please select a file smaller than 5MB.');
            return;
        }
        
        console.log('Starting image processing:', { fileName: file.name, fileSize: file.size, fileType: file.type });
        setUploadingImage(true);
        
        try {
            // Compress image to reduce size
            const compressedBase64 = await compressImage(file, 800, 0.7);
            
            // Check if compressed image is still too large for Firestore (1MB limit)
            const sizeInBytes = (compressedBase64.length * 3) / 4; // Approximate base64 to bytes
            const maxFirestoreSize = 1024 * 1024; // 1MB
            
            if (sizeInBytes > maxFirestoreSize) {
                // Try with more compression
                const moreCompressed = await compressImage(file, 600, 0.5);
                const compressedSize = (moreCompressed.length * 3) / 4;
                
                if (compressedSize > maxFirestoreSize) {
                    alert('Image is too large even after compression. Please try a smaller image.');
                    setUploadingImage(false);
                    return;
                }
                
                console.log('Image compressed successfully (high compression)');
                setUserProfile(prev => ({
                    ...prev,
                    [type]: moreCompressed
                }));
            } else {
                console.log('Image compressed successfully');
                setUserProfile(prev => ({
                    ...prev,
                    [type]: compressedBase64
                }));
            }
            
            setUploadingImage(false);
            console.log('Image processing completed successfully');
            
        } catch (error) {
            console.error('Error processing image:', error);
            alert(`Error processing image: ${error.message || 'Please try again.'}`);
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
            
            // Update user profile in both collections
            const profileRef = firestore.collection('userProfiles').doc(documentId);
            const userRef = firestore.collection('users').doc(documentId);
            const profileData = {
                username: userProfile.username,
                aboutMe: userProfile.aboutMe,
                profilePicture: userProfile.profilePicture,
                banner: userProfile.banner,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Save to both collections
            await profileRef.set(profileData, { merge: true });
            await userRef.set(profileData, { merge: true });
            
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
                                {uploadingImage ? 'Processing...' : 'Change Banner'}
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

function CreateServerModal({ onClose, onCreateServer, serverName, setServerName, serverDescription, setServerDescription }) {
    const modalRef = useRef(null);
    
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

    const handleSubmit = (e) => {
        e.preventDefault();
        onCreateServer();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content create-server-modal" ref={modalRef}>
                <div className="modal-header">
                    <h2>Create Server</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                
                <form onSubmit={handleSubmit} className="create-server-form">
                    <div className="form-group">
                        <label htmlFor="serverName">Server Name *</label>
                        <input
                            type="text"
                            id="serverName"
                            value={serverName}
                            onChange={(e) => setServerName(e.target.value)}
                            placeholder="Enter server name"
                            maxLength={50}
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="serverDescription">Description (Optional)</label>
                        <textarea
                            id="serverDescription"
                            value={serverDescription}
                            onChange={(e) => setServerDescription(e.target.value)}
                            placeholder="Enter server description"
                            maxLength={200}
                            rows={3}
                        />
                    </div>
                    
                    <div className="modal-actions">
                        <button type="button" className="cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="create-btn">
                            Create Server
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ServerIconModal({ onClose, onIconChange, serverIcon, setServerIcon }) {
    const modalRef = useRef(null);
    const fileInputRef = useRef(null);
    const [iconType, setIconType] = useState('text'); // 'text' or 'image'
    const [previewImage, setPreviewImage] = useState(null);
    
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

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Compress and convert to base64
            compressImage(file, 100, 100, 0.8).then(compressedBase64 => {
                setServerIcon(compressedBase64);
                setPreviewImage(compressedBase64);
            }).catch(error => {
                console.error('Error compressing image:', error);
                alert('Error processing image. Please try again.');
            });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (iconType === 'text' && !serverIcon.trim()) {
            alert('Please enter an icon');
            return;
        }
        if (iconType === 'image' && !serverIcon) {
            alert('Please select an image');
            return;
        }
        onIconChange(serverIcon);
    };

    const clearImage = () => {
        setServerIcon('');
        setPreviewImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content create-server-modal" ref={modalRef}>
                <div className="modal-header">
                    <h2>Change Server Icon</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                
                <form onSubmit={handleSubmit} className="create-server-form">
                    <div className="form-group">
                        <label>Icon Type</label>
                        <div className="icon-type-selector">
                            <button
                                type="button"
                                className={`icon-type-btn ${iconType === 'text' ? 'active' : ''}`}
                                onClick={() => setIconType('text')}
                            >
                                Text/Emoji
                            </button>
                            <button
                                type="button"
                                className={`icon-type-btn ${iconType === 'image' ? 'active' : ''}`}
                                onClick={() => setIconType('image')}
                            >
                                Image
                            </button>
                        </div>
                    </div>

                    {iconType === 'text' ? (
                        <div className="form-group">
                            <label htmlFor="serverIcon">Server Icon *</label>
                            <input
                                type="text"
                                id="serverIcon"
                                value={serverIcon}
                                onChange={(e) => setServerIcon(e.target.value)}
                                placeholder="Enter emoji or text (e.g., 🎮, A, 1)"
                                maxLength={2}
                                required
                            />
                            <small className="form-help">Enter a single emoji or 1-2 characters</small>
                        </div>
                    ) : (
                        <div className="form-group">
                            <label htmlFor="serverIconFile">Server Icon Image *</label>
                            <div className="image-upload-area">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    id="serverIconFile"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    className="file-upload-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Choose Image
                                </button>
                                {previewImage && (
                                    <div className="image-preview">
                                        <img src={previewImage} alt="Preview" />
                                        <button
                                            type="button"
                                            className="clear-image-btn"
                                            onClick={clearImage}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}
                            </div>
                            <small className="form-help">Upload an image (max 100x100px, will be resized)</small>
                        </div>
                    )}
                    
                    <div className="modal-actions">
                        <button type="button" className="cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="create-btn">
                            Change Icon
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default App;