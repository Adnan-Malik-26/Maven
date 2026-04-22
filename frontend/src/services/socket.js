import { io } from 'socket.io-client'

let socket = null

export const getSocket = () => {
  if (!socket) {
    socket = io(import.meta.env.VITE_BACKEND_URL, {
      autoConnect: false,
    })
  }
  return socket
}

export const connectSocket    = () => getSocket().connect()
export const disconnectSocket = () => getSocket().disconnect()
