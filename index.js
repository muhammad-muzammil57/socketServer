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

  // ─── Existing identity event ─────────────────────────
  socket.on("identity", (userId) => {
    console.log("User Id:", userId)
  })

  // ─── User live chat shuru karta hai ──────────────────
  socket.on("chat:start", ({ roomId, userId, userName }) => {
    // Room join karo
    socket.join(roomId)

    // Room data save karo
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

    // Check karo agar admin pehle se join kar chuka hai
    if (room.adminId) {
      socket.emit("chat:already-taken", {
        message: "Koi aur admin pehle se join kar chuka hai",
      })
      return
    }

    // Admin ko room mein add karo
    socket.join(roomId)
    room.adminId = adminId
    room.adminName = adminName
    room.adminSocketId = socket.id
    chatRooms.set(roomId, room)

    // User ko batao admin aa gaya
io.to(roomId).emit("chat:admin-joined", { adminName })
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

    // Dono ko message bhejo (sender ko bhi confirm ke liye nahi — sirf doosre ko)
    socket.to(roomId).emit("chat:message", message)

    console.log(`Message in ${roomId} from ${senderName}: ${text}`)
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
    // Agar koi chat room mein tha toh doosre ko notify karo
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
