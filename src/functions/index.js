const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Filter = require("bad-words");

admin.initializeApp();
const db = admin.firestore();

exports.detectEvilUsers = functions.firestore
    .document("messages/{msgId}")
    .onCreate(async (snapshot, context) => {
        try {
            const filter = new Filter();
            const {text, uid} = snapshot.data();

            if (filter.isProfane(text)) {
                const cleaned = filter.clean(text);
                await snapshot.ref.update({
                    text: `I got banned for bad words! (Original: ${cleaned})`,
                });
                await db.collection("banned").doc(uid).set({
                    reason: "Profanity",
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
        } catch (error) {
            functions.logger.error("Error filtering message:", error);
            throw error;
        }
    });