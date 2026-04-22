const { io } = require('socket.io-client');

const socket = io('http://localhost:4000');

socket.on('connect', () => {
    console.log('connected to server! My ID is: ', socket.id);

    const fakeJobId = '124-test-job';
    socket.emit('join_job', fakeJobId);
    console.log(`Requested to join job:${fakeJobId}`);
})

socket.on('joined', (room) => {
    console.log(`Successfully joined room: ${room}`)
})

socket.on('analysis_complete', (data) => {
    console.log('Analysis complete!', data);
})

socket.on('analysis_failed', (data) => {
    console.log('Analysis failed!', data);
})          