var serviceAccount = require("./beezhive-c0604-firebase-adminsdk-zauph-6394c98916.json");

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const express = require("express");
const cors = require("cors");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const db = admin.firestore();

app.use(express.json());
app.use(cors({ origin: true }));

app.get("/", (req, res) => {
  console.log("Logged from Root Route");
  return res.status(200).send("Hi from Root Route !!!!");
});

app.route("/api/v1/users/:id").get(async (req, res) => {
  const id = req.params.id;
  const userRef = await db.collection("users").doc(id).get();
  const walletRef = await db.collection("wallets").doc(id).get();
  const walletHistoryRef = await db.collection("wallet_history").doc(id).get();
  return res.status(200).json({
    status: "success",
    data: {
      ...userRef.data(),
      walletRef: walletRef.data(),
      walletHistoryRef: walletHistoryRef.data(),
    },
  });
});

app.route("/api/v1/users").post(async (req, res) => {
  const { email, name, phoneNumber } = req.body;
  const userRef = await db.collection("users").doc();
  const walletRef = await db.collection("wallets").doc(userRef.id);
  const walletHistoryRef = await db
    .collection("wallet_history")
    .doc(userRef.id);
  await userRef.set({
    id: userRef.id,
    name,
    email,
    phoneNumber,
    walletRef: db.doc(`wallets/${userRef.id}`),
    walletHistoryRef: db.doc(`wallet_history/${userRef.id}`),
  });
  await walletRef.set({
    balance: 0,
    lastTransaction: null,
  });
  await walletHistoryRef.set({ transactions: [] });
  return res.status(200).json({
    status: "success",
    data: {
      id: userRef.id,
      name,
      email,
      phoneNumber,
    },
  });
});

app.route("/api/v1/wallet/credit/:id").post(async (req, res) => {
  const id = req.params.id;
  const amount = req.body.amount;
  const walletRef = db.collection("wallets").doc(id);
  const walletHistoryRef = db.collection("wallet_history").doc(id);
  try {
    await db.runTransaction(async (t) => {
      const wallet = await t.get(walletRef);
      t.update(walletRef, {
        balance: wallet.data().balance + amount,
        lastTransaction: Date.now(),
      });
      t.update(walletHistoryRef, {
        transactions: admin.firestore.FieldValue.arrayUnion({
          type: "credit",
          amountTransferred: amount,
          transferredAt: Date.now(),
          id: Date.now(),
        }),
      });
    });
    console.log("Transaction success!");
    return res.status(200).json({
      status: "success",
      message: {
        creditedAmount: amount,
      },
    });
  } catch (e) {
    console.log("Transaction failure:", e);
    return res.status(500).json({
      status: "failure",
      message: "Transaction Failed... Try again after sometime....",
    });
  }
});

app.route("/api/v1/wallet/debit/:id").post(async (req, res) => {
  const sender = req.params.id;
  const reciever = req.body.id;
  const amount = req.body.amount;
  const senderWalletRef = db.collection("wallets").doc(sender);
  const recieverWalletRef = db.collection("wallets").doc(reciever);
  const senderWalletHistoryRef = db.collection("wallet_history").doc(sender);
  const recieverWalletHistoryRef = db
    .collection("wallet_history")
    .doc(reciever);
  try {
    await db.runTransaction(async (t) => {
      const senderDoc = await t.get(senderWalletRef);
      const recieverDoc = await t.get(recieverWalletRef);
      if (senderDoc.data().balance >= amount) {
        const senderAmount = senderDoc.data().balance - amount;
        const recieverAmount = recieverDoc.data().balance + amount;
        t.update(senderWalletRef, {
          balance: senderAmount,
          lastTransaction: Date.now(),
        });
        t.update(recieverWalletRef, {
          balance: recieverAmount,
          lastTransaction: Date.now(),
        });
        t.update(senderWalletHistoryRef, {
          transactions: admin.firestore.FieldValue.arrayUnion({
            type: "debit",
            amountTransferred: amount,
            transferredAt: Date.now(),
            id: Date.now(),
            to: reciever,
          }),
        });
        t.update(recieverWalletHistoryRef, {
          transactions: admin.firestore.FieldValue.arrayUnion({
            type: "credit",
            amountTransferred: amount,
            transferredAt: Date.now(),
            id: Date.now(),
            from: sender,
          }),
        });
      }
    });
    console.log("Transaction success!");
    return res.status(200).json({
      status: "success",
      message: {
        transferredAmount: amount,
        reciever: reciever,
      },
    });
  } catch (e) {
    console.log("Transaction failure:", e);
    return res.status(500).json({
      status: "failure",
      message: "Transaction Failed... Try again after sometime....",
    });
  }
});

exports.app = functions.https.onRequest(app);
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
