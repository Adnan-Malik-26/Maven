/**
 * Socket.io singleton holder.
 * 
 * Breaks the circular dependency between app.js and mlOrchestrator.js.
 * app.js sets the io instance after creation, and any service can
 * retrieve it via getIO() without importing app.js directly.
 */

let io = null;

function setIO(ioInstance) {
  io = ioInstance;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io has not been initialized — call setIO() first');
  }
  return io;
}

module.exports = { setIO, getIO };
