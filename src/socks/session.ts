// Abstract SOCKS session.
// TODO: pause and resume
interface SocksSession {
  onRemoteData: (buffer: ArrayBuffer) => void;
  onRemoteDisconnect: () => void;
}

export = SocksSession;
