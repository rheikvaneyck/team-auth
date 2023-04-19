exports.getSocket = exports.setSocket = void 0;

var sockets: any = {};

const setSocket = (id: string, socket: any) => {
	sockets[id] = socket;
};

const getSocket = (id: string) => {
	return sockets[id] || null;
};

export { setSocket, getSocket };