import express from "express"
import http from "http"
import dotenv from "dotenv"
import { Server } from "socket.io"

dotenv.config()

const app = express()
const server = http.createServer(app)
const port = process.env.PORT || 5000

const io = new Server(server, {
  cors: {
    origin: process.env.NEXT_BASE_URL,
    methods: ["GET", "POST"],
  },
})

// Active chat rooms track karo
// roomId => { userId, userName, adminId, adminName, adminSocketId }
const chatRooms = new Map()

io.on("connection", (socket) => {
  console.log("User Connected:", socket.id)

  socket.on("identity", (userId) => {
    console.log("User Id:", userId)
  })

  // ─── User live chat shuru karta hai ──────────────────
  socket.on("chat:start", ({ roomId, userId, userName }) => {
    socket.join(roomId)
    chatRooms.set(roomId, {
      userId,
      userName,
      userSocketId: socket.id,
      adminId: null,
      adminName: null,
      adminSocketId: null,
    })
    console.log(`Chat started — Room: ${roomId} — User: ${userName}`)
  })

  // ─── Admin chat join karta hai ────────────────────────
  socket.on("chat:join", ({ roomId, adminId, adminName }) => {
    const room = chatRooms.get(roomId)
    if (!room) {
      socket.emit("chat:error", { message: "Room nahi mila" })
      return
    }
    if (room.adminId) {
      socket.emit("chat:already-taken", {
        message: "Koi aur admin pehle se join kar chuka hai",
      })
      return
    }
    socket.join(roomId)
    room.adminId = adminId
    room.adminName = adminName
    room.adminSocketId = socket.id
    chatRooms.set(roomId, room)
    socket.to(roomId).emit("chat:admin-joined", { adminName })
    console.log(`Admin joined — Room: ${roomId} — Admin: ${adminName}`)
  })

  // ─── Message bhejnа ──────────────────────────────────
  socket.on("chat:message", ({ roomId, sender, senderName, text }) => {
    const message = {
      sender,
      senderName,
      text,
      createdAt: new Date(),
    }
    socket.to(roomId).emit("chat:message", message)
    console.log(`Message in ${roomId} from ${senderName}: ${text}`)
  })

  // ─── FIX 1: Typing relay — YAHAN SE ADD KIYA ─────────
  // Pehle yeh event bilkul nahi tha — isliye typing dots kaam nahi karte the
  socket.on("chat:typing", ({ roomId, isTyping, senderName }) => {
    socket.to(roomId).emit("chat:typing", { isTyping, senderName })
  })

  // ─── File message relay ───────────────────────────────
  socket.on("chat:file", ({ roomId, sender, senderName, fileName, fileUrl, fileType }) => {
    const message = {
      sender,
      senderName,
      fileName,
      fileUrl,
      fileType,
      type: "file",
      createdAt: new Date(),
    }
    socket.to(roomId).emit("chat:file", message)
    console.log(`File in ${roomId} from ${senderName}: ${fileName}`)
  })

  // ─── Chat band karo ──────────────────────────────────
  socket.on("chat:close", ({ roomId }) => {
    socket.to(roomId).emit("chat:closed")
    chatRooms.delete(roomId)
    socket.leave(roomId)
    console.log(`Chat closed — Room: ${roomId}`)
  })

  // ─── Disconnect ──────────────────────────────────────
  socket.on("disconnect", () => {
    chatRooms.forEach((room, roomId) => {
      if (room.userSocketId === socket.id) {
        socket.to(roomId).emit("chat:user-left")
        chatRooms.delete(roomId)
      } else if (room.adminSocketId === socket.id) {
        socket.to(roomId).emit("chat:admin-left")
        room.adminId = null
        room.adminName = null
        room.adminSocketId = null
        chatRooms.set(roomId, room)
      }
    })
    console.log("User Disconnected:", socket.id)
  })
})

server.listen(port, () => {
  console.log("Server Started At", port)
})
