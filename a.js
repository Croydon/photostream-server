//var io = require('socket.io-client');

var sockets = {};

connected = 0;

for (var socket_n = 0; socket_n < 150; socket_n++) {

	var socket = io.connect('http://5.45.97.155:8082/?token=' + socket_n, {'force new connection': true});

	socket.on('connect', function(){
	    connected += 1;
		console.log(connected);	
	});
	
	socket.on('new_photo', function(data){
		console.log("received photo");
	});
	
	socket.on('disconnect', function () {
		console.info("Disconnected");
		connected = connected - 1;
		console.log(connected);
	});		

	sockets[socket_n] = socket;
}